import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth";
import { summarizePartsReadiness } from "@/lib/mindful-inventory/parts-readiness";

const PARTS_ETA_BUFFER_MINUTES = 120;

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB;
}

function localParts(date: Date, offsetMinutes: number) {
  const shifted = new Date(date.getTime() - offsetMinutes * 60_000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate(), weekday: shifted.getUTCDay(), hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() };
}

function fromLocal(year: number, month: number, day: number, hour: number, minute: number, offsetMinutes: number) {
  return new Date(Date.UTC(year, month, day, hour, minute) + offsetMinutes * 60_000);
}

type Segment = { startAt: string; endAt: string };

function laborSegments(startValue: Date, laborMinutes: number, offsetMinutes: number): Segment[] {
  let remaining = Math.max(1, Math.round(laborMinutes));
  let cursor = new Date(startValue);
  const segments: Segment[] = [];
  let guard = 0;
  while (remaining > 0 && guard < 30) {
    guard += 1;
    let p = localParts(cursor, offsetMinutes);
    if (p.weekday === 0 || p.weekday === 6 || p.hour >= 17) {
      const daysToAdd = p.weekday === 5 ? 3 : p.weekday === 6 ? 2 : 1;
      cursor = fromLocal(p.year, p.month, p.day + daysToAdd, 8, 0, offsetMinutes);
      continue;
    }
    if (p.hour < 8) {
      cursor = fromLocal(p.year, p.month, p.day, 8, 0, offsetMinutes);
      p = localParts(cursor, offsetMinutes);
    }
    const available = Math.max(0, 17 * 60 - (p.hour * 60 + p.minute));
    if (!available) { cursor = fromLocal(p.year, p.month, p.day + 1, 8, 0, offsetMinutes); continue; }
    const used = Math.min(remaining, available);
    const end = new Date(cursor.getTime() + used * 60_000);
    segments.push({ startAt: cursor.toISOString(), endAt: end.toISOString() });
    remaining -= used;
    cursor = fromLocal(p.year, p.month, p.day + 1, 8, 0, offsetMinutes);
  }
  return remaining > 0 ? [] : segments;
}

export async function GET(request: Request, context: { params: Promise<{ workOrderId: string }> }) {
  try {
    const authClient = await createSupabaseServerAuthClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { workOrderId } = await context.params;
    const url = new URL(request.url);
    const offsetRaw = Number(url.searchParams.get("tzOffset") || "0");
    const offsetMinutes = Number.isFinite(offsetRaw) ? Math.max(-840, Math.min(840, offsetRaw)) : 0;
    const admin = createSupabaseAdminClient();

    const { data: work, error: workError } = await admin
      .from("mindful_inventory_work_orders")
      .select("id,vehicle_id,assigned_partner_id,resource_id,estimated_labor_minutes,estimated_elapsed_minutes,estimated_duration_minutes,partner_estimate_status,parts_review_status")
      .eq("id", workOrderId)
      .maybeSingle();
    if (workError) throw new Error(workError.message);
    if (!work?.assigned_partner_id) return NextResponse.json({ error: "Assigned Work Order not found." }, { status: 404 });

    const { data: partner, error: partnerError } = await admin
      .from("mindful_inventory_partners")
      .select("id,user_id,active,company_id")
      .eq("id", work.assigned_partner_id)
      .maybeSingle();
    if (partnerError) throw new Error(partnerError.message);
    if (!partner || !partner.active || partner.user_id !== user.id) return NextResponse.json({ error: "You are not the assigned partner for this Work Order." }, { status: 403 });

    const { data: partRows, error: partsError } = await admin
      .from("mindful_inventory_work_order_parts")
      .select("work_order_id,status,eta_at")
      .eq("work_order_id", workOrderId);
    if (partsError) throw new Error(partsError.message);
    const parts = summarizePartsReadiness(partRows || []);

    const { data: latestEstimate } = await admin
      .from("lot_logic_partner_blind_estimates")
      .select("estimated_labor_minutes,estimated_elapsed_minutes")
      .eq("work_order_id", workOrderId)
      .eq("partner_id", partner.id)
      .order("revision_no", { ascending: false })
      .limit(1)
      .maybeSingle();

    const laborRaw = Number(latestEstimate?.estimated_labor_minutes ?? work.estimated_labor_minutes ?? 60);
    const laborMinutes = Number.isFinite(laborRaw) && laborRaw > 0 ? laborRaw : 60;
    const elapsedRaw = Number(latestEstimate?.estimated_elapsed_minutes ?? work.estimated_elapsed_minutes ?? work.estimated_duration_minutes ?? laborMinutes);
    const elapsedMinutes = Number.isFinite(elapsedRaw) && elapsedRaw > 0 ? elapsedRaw : laborMinutes;

    const { data: companyVehicles, error: vehicleError } = await admin.from("mindful_inventory_vehicles").select("id").eq("company_id", partner.company_id);
    if (vehicleError) throw new Error(vehicleError.message);
    const vehicleIds = (companyVehicles || []).map((row) => row.id);

    const now = Date.now();
    const horizonEnd = new Date(now + 14 * 24 * 60 * 60_000);
    const { data: busyRows, error: busyError } = vehicleIds.length
      ? await admin.from("mindful_inventory_work_orders")
          .select("id,vehicle_id,assigned_partner_id,resource_id,estimated_labor_minutes,scheduled_start_at,proposed_start_at,status")
          .in("vehicle_id", vehicleIds).neq("id", workOrderId).not("status", "in", '("complete","cancelled")')
      : { data: [], error: null };
    if (busyError) throw new Error(busyError.message);

    const busy = (busyRows || []).flatMap((row) => {
      const startValue = row.scheduled_start_at || row.proposed_start_at;
      if (!startValue) return [];
      const start = new Date(startValue);
      if (!Number.isFinite(start.getTime()) || start.getTime() > horizonEnd.getTime()) return [];
      const otherLaborRaw = Number(row.estimated_labor_minutes ?? 60);
      const otherLabor = Number.isFinite(otherLaborRaw) && otherLaborRaw > 0 ? otherLaborRaw : 60;
      return laborSegments(start, otherLabor, offsetMinutes).map((segment) => ({
        start: new Date(segment.startAt).getTime(), end: new Date(segment.endAt).getTime(),
        vehicleId: row.vehicle_id as string, partnerId: row.assigned_partner_id as string | null, resourceId: row.resource_id as string | null,
      }));
    });

    const firstCandidate = new Date(Math.ceil((now + 30 * 60_000) / (30 * 60_000)) * 30 * 60_000);
    const firstLocal = localParts(firstCandidate, offsetMinutes);
    const etaRaw = parts.latestEtaAt ? new Date(parts.latestEtaAt).getTime() : null;
    const etaFloor = etaRaw !== null && Number.isFinite(etaRaw) ? etaRaw + PARTS_ETA_BUFFER_MINUTES * 60_000 : null;
    const suggestions: Array<{ startAt: string; endAt: string; segments: Segment[] }> = [];
    const selectedByDay = new Map<string, number[]>();

    for (let dayOffset = 0; dayOffset < 14 && suggestions.length < 6; dayOffset += 1) {
      const baseNoon = fromLocal(firstLocal.year, firstLocal.month, firstLocal.day + dayOffset, 12, 0, offsetMinutes);
      const p = localParts(baseNoon, offsetMinutes);
      if (p.weekday === 0 || p.weekday === 6) continue;
      const dayKey = `${p.year}-${p.month}-${p.day}`;
      for (let minuteOfDay = 8 * 60; minuteOfDay < 17 * 60 && suggestions.length < 6; minuteOfDay += 30) {
        const start = fromLocal(p.year, p.month, p.day, Math.floor(minuteOfDay / 60), minuteOfDay % 60, offsetMinutes);
        if (start.getTime() < firstCandidate.getTime()) continue;
        if (etaFloor && !parts.readyForExecution && start.getTime() < etaFloor) continue;
        const daySelections = selectedByDay.get(dayKey) || [];
        if (daySelections.length >= 2 || daySelections.some((selected) => Math.abs(start.getTime() - selected) < 2 * 60 * 60_000)) continue;
        const segments = laborSegments(start, laborMinutes, offsetMinutes);
        if (!segments.length) continue;
        const conflict = segments.some((segment) => busy.some((item) => {
          const segmentStart = new Date(segment.startAt).getTime(); const segmentEnd = new Date(segment.endAt).getTime();
          if (!overlaps(segmentStart, segmentEnd, item.start, item.end)) return false;
          if (item.vehicleId === work.vehicle_id) return true;
          if (item.partnerId === partner.id) return true;
          if (work.resource_id && item.resourceId === work.resource_id) return true;
          return false;
        }));
        if (conflict) continue;
        suggestions.push({ startAt: segments[0].startAt, endAt: segments[segments.length - 1].endAt, segments });
        selectedByDay.set(dayKey, [...daySelections, start.getTime()]);
      }
    }

    const guidance: string[] = [];
    if (work.parts_review_status !== "resolved") guidance.push("parts review pending");
    else if (!parts.readyForExecution) guidance.push(parts.latestEtaAt ? "suggestions begin after the latest known parts ETA + 2 hr receiving buffer" : "parts ETA unknown · suggestions use known availability constraints only");
    if (!["approved", "not_required"].includes(work.partner_estimate_status || "")) guidance.push("labor quote still pending");
    if (laborMinutes > 9 * 60) guidance.push(`${Math.round((laborMinutes / 60) * 10) / 10} labor hr allocated across workdays`);
    if (elapsedMinutes > laborMinutes) guidance.push(`${Math.round((elapsedMinutes / 60) * 10) / 10} hr elapsed turnaround tracked separately`);

    return NextResponse.json({ laborMinutes, elapsedMinutes, suggestions, guidance: guidance.join(" · ") || null, partsLatestEtaAt: parts.latestEtaAt, partsEtaBufferMinutes: PARTS_ETA_BUFFER_MINUTES });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not calculate schedule availability." }, { status: 500 });
  }
}
