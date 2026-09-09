import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { summarizePartsReadiness } from "@/lib/mindful-inventory/parts-readiness";

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

    const minuteOfDay = p.hour * 60 + p.minute;
    const available = Math.max(0, 17 * 60 - minuteOfDay);
    if (!available) {
      cursor = fromLocal(p.year, p.month, p.day + 1, 8, 0, offsetMinutes);
      continue;
    }
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
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { workOrderId } = await context.params;
    const url = new URL(request.url);
    const offsetRaw = Number(url.searchParams.get("tzOffset") || "0");
    const offsetMinutes = Number.isFinite(offsetRaw) ? Math.max(-840, Math.min(840, offsetRaw)) : 0;

    const { data: work, error: workError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .select("id,vehicle_id,estimated_labor_minutes,estimated_elapsed_minutes,estimated_duration_minutes,assigned_partner_id,assigned_user_id,resource_id,parts_review_status,partner_estimate_status")
      .eq("id", workOrderId)
      .single();
    if (workError || !work) return NextResponse.json({ error: "Work Order not found." }, { status: 404 });

    const { data: companyVehicles, error: vehicleError } = await access.supabase
      .from("mindful_inventory_vehicles")
      .select("id")
      .eq("company_id", access.company.companyId);
    if (vehicleError) throw new Error(vehicleError.message);
    const vehicleIds = (companyVehicles || []).map((row) => row.id);
    if (!vehicleIds.includes(work.vehicle_id)) return NextResponse.json({ error: "Work Order is outside the current company." }, { status: 403 });

    const { data: partRows, error: partsError } = await access.supabase
      .from("mindful_inventory_work_order_parts")
      .select("work_order_id,status,eta_at")
      .eq("work_order_id", workOrderId);
    if (partsError) throw new Error(partsError.message);
    const parts = summarizePartsReadiness(partRows || []);

    const laborRaw = Number(work.estimated_labor_minutes ?? 60);
    const laborMinutes = Number.isFinite(laborRaw) && laborRaw > 0 ? laborRaw : 60;
    const elapsedRaw = Number(work.estimated_elapsed_minutes ?? work.estimated_duration_minutes ?? laborMinutes);
    const elapsedMinutes = Number.isFinite(elapsedRaw) && elapsedRaw > 0 ? elapsedRaw : laborMinutes;
    const now = Date.now();
    const horizonEnd = new Date(now + 14 * 24 * 60 * 60_000);

    const { data: busyRows, error: busyError } = vehicleIds.length
      ? await access.supabase
          .from("mindful_inventory_work_orders")
          .select("id,vehicle_id,assigned_partner_id,assigned_user_id,resource_id,estimated_labor_minutes,scheduled_start_at,proposed_start_at,status")
          .in("vehicle_id", vehicleIds)
          .neq("id", workOrderId)
          .not("status", "in", '("complete","cancelled")')
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
        start: new Date(segment.startAt).getTime(),
        end: new Date(segment.endAt).getTime(),
        vehicleId: row.vehicle_id as string,
        partnerId: row.assigned_partner_id as string | null,
        userId: row.assigned_user_id as string | null,
        resourceId: row.resource_id as string | null,
      }));
    });

    const firstCandidate = new Date(Math.ceil((now + 30 * 60_000) / (30 * 60_000)) * 30 * 60_000);
    const firstLocal = localParts(firstCandidate, offsetMinutes);
    const etaFloor = parts.latestEtaAt ? new Date(parts.latestEtaAt).getTime() : null;
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
        const conflict = segments.some((segment) => {
          const segmentStart = new Date(segment.startAt).getTime();
          const segmentEnd = new Date(segment.endAt).getTime();
          return busy.some((item) => {
            if (!overlaps(segmentStart, segmentEnd, item.start, item.end)) return false;
            if (item.vehicleId === work.vehicle_id) return true;
            if (work.assigned_partner_id && item.partnerId === work.assigned_partner_id) return true;
            if (work.assigned_user_id && item.userId === work.assigned_user_id) return true;
            if (work.resource_id && item.resourceId === work.resource_id) return true;
            return false;
          });
        });
        if (conflict) continue;

        suggestions.push({ startAt: segments[0].startAt, endAt: segments[segments.length - 1].endAt, segments });
        selectedByDay.set(dayKey, [...daySelections, start.getTime()]);
      }
    }

    const guidance: string[] = [];
    if (!work.assigned_partner_id && !work.assigned_user_id) guidance.push("Assignee not selected yet");
    if (work.parts_review_status !== "resolved") guidance.push("parts review pending");
    else if (!parts.readyForExecution) guidance.push(parts.latestEtaAt ? "suggestions begin after the latest known parts ETA" : "parts readiness unknown");
    if (work.assigned_partner_id && !["approved", "not_required"].includes(work.partner_estimate_status || "")) guidance.push("partner quote still pending");
    if (laborMinutes > 9 * 60) guidance.push(`${Math.round((laborMinutes / 60) * 10) / 10} labor hr allocated across workdays`);
    if (elapsedMinutes > laborMinutes) guidance.push(`${Math.round((elapsedMinutes / 60) * 10) / 10} hr elapsed turnaround tracked separately`);

    return NextResponse.json({ laborMinutes, elapsedMinutes, suggestions, guidance: guidance.join(" · ") || null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not calculate schedule availability." }, { status: 500 });
  }
}
