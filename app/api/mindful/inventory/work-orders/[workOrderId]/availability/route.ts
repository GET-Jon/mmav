import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { summarizePartsReadiness } from "@/lib/mindful-inventory/parts-readiness";

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB;
}

function localParts(date: Date, offsetMinutes: number) {
  const shifted = new Date(date.getTime() - offsetMinutes * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

function fromLocal(year: number, month: number, day: number, hour: number, minute: number, offsetMinutes: number) {
  return new Date(Date.UTC(year, month, day, hour, minute) + offsetMinutes * 60_000);
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
      .select("id,vehicle_id,estimated_elapsed_minutes,estimated_duration_minutes,assigned_partner_id,assigned_user_id,resource_id,parts_review_status,partner_estimate_status")
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

    const durationRaw = Number(work.estimated_elapsed_minutes ?? work.estimated_duration_minutes ?? 60);
    const durationMinutes = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : 60;
    const now = Date.now();
    const horizonStart = new Date(now);
    const horizonEnd = new Date(now + 14 * 24 * 60 * 60_000);

    const { data: busyRows, error: busyError } = vehicleIds.length
      ? await access.supabase
          .from("mindful_inventory_work_orders")
          .select("id,vehicle_id,assigned_partner_id,assigned_user_id,resource_id,scheduled_start_at,scheduled_end_at,proposed_start_at,proposed_end_at,status")
          .in("vehicle_id", vehicleIds)
          .neq("id", workOrderId)
          .not("status", "in", '("complete","cancelled")')
      : { data: [], error: null };
    if (busyError) throw new Error(busyError.message);

    const busy = (busyRows || []).flatMap((row) => {
      const startValue = row.scheduled_start_at || row.proposed_start_at;
      const endValue = row.scheduled_end_at || row.proposed_end_at;
      if (!startValue || !endValue) return [];
      const start = new Date(startValue).getTime();
      const end = new Date(endValue).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < horizonStart.getTime() || start > horizonEnd.getTime()) return [];
      return [{
        start,
        end,
        vehicleId: row.vehicle_id as string,
        partnerId: row.assigned_partner_id as string | null,
        userId: row.assigned_user_id as string | null,
        resourceId: row.resource_id as string | null,
      }];
    });

    const firstCandidate = new Date(Math.ceil((now + 30 * 60_000) / (30 * 60_000)) * 30 * 60_000);
    const firstLocal = localParts(firstCandidate, offsetMinutes);
    const etaFloor = parts.latestEtaAt ? new Date(parts.latestEtaAt).getTime() : null;
    const suggestions: Array<{ startAt: string; endAt: string }> = [];
    const selectedByDay = new Map<string, number[]>();

    for (let dayOffset = 0; dayOffset < 14 && suggestions.length < 6; dayOffset += 1) {
      const baseNoon = fromLocal(firstLocal.year, firstLocal.month, firstLocal.day + dayOffset, 12, 0, offsetMinutes);
      const p = localParts(baseNoon, offsetMinutes);
      if (p.weekday === 0 || p.weekday === 6) continue;
      const dayKey = `${p.year}-${p.month}-${p.day}`;

      for (let minuteOfDay = 8 * 60; minuteOfDay + durationMinutes <= 17 * 60 && suggestions.length < 6; minuteOfDay += 30) {
        const hour = Math.floor(minuteOfDay / 60);
        const minute = minuteOfDay % 60;
        const start = fromLocal(p.year, p.month, p.day, hour, minute, offsetMinutes);
        const end = new Date(start.getTime() + durationMinutes * 60_000);
        if (start.getTime() < firstCandidate.getTime()) continue;
        // Known parts ETA improves the recommendation, but never locks manual scheduling.
        if (etaFloor && !parts.readyForExecution && start.getTime() < etaFloor) continue;

        const daySelections = selectedByDay.get(dayKey) || [];
        if (daySelections.length >= 2) continue;
        if (daySelections.some((selected) => Math.abs(start.getTime() - selected) < 2 * 60 * 60_000)) continue;

        const conflict = busy.some((item) => {
          if (!overlaps(start.getTime(), end.getTime(), item.start, item.end)) return false;
          if (item.vehicleId === work.vehicle_id) return true;
          if (work.assigned_partner_id && item.partnerId === work.assigned_partner_id) return true;
          if (work.assigned_user_id && item.userId === work.assigned_user_id) return true;
          if (work.resource_id && item.resourceId === work.resource_id) return true;
          return false;
        });
        if (conflict) continue;

        suggestions.push({ startAt: start.toISOString(), endAt: end.toISOString() });
        selectedByDay.set(dayKey, [...daySelections, start.getTime()]);
      }
    }

    const guidance: string[] = [];
    if (!work.assigned_partner_id && !work.assigned_user_id) guidance.push("Assignee not selected yet");
    if (work.parts_review_status !== "resolved") guidance.push("parts review pending");
    else if (!parts.readyForExecution) guidance.push(parts.latestEtaAt ? "suggestions begin after the latest known parts ETA" : "parts readiness unknown");
    if (work.assigned_partner_id && !["approved", "not_required"].includes(work.partner_estimate_status || "")) guidance.push("partner quote still pending");

    return NextResponse.json({ durationMinutes, suggestions, guidance: guidance.join(" · ") || null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not calculate schedule availability." }, { status: 500 });
  }
}
