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
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
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
      .select("id,vehicle_id,estimated_elapsed_minutes,estimated_duration_minutes,assigned_partner_id,assigned_user_id,location_id,resource_id,parts_review_status,partner_estimate_status")
      .eq("id", workOrderId)
      .single();
    if (workError || !work) return NextResponse.json({ error: "Work Order not found." }, { status: 404 });

    const { data: vehicle } = await access.supabase
      .from("mindful_inventory_vehicles")
      .select("id")
      .eq("id", work.vehicle_id)
      .eq("company_id", access.company.companyId)
      .maybeSingle();
    if (!vehicle) return NextResponse.json({ error: "Work Order is outside the current company." }, { status: 403 });

    if (work.parts_review_status !== "resolved") return NextResponse.json({ error: "Complete Parts Review before scheduling." }, { status: 409 });
    if (!work.assigned_partner_id && !work.assigned_user_id) return NextResponse.json({ error: "Choose a Partner before scheduling." }, { status: 409 });
    if (!work.location_id) return NextResponse.json({ error: "Choose the work location before scheduling." }, { status: 409 });
    if (work.assigned_partner_id && !["approved", "not_required"].includes(work.partner_estimate_status || "")) {
      return NextResponse.json({ error: "Approve the partner labor estimate before scheduling." }, { status: 409 });
    }

    const { data: partRows, error: partsError } = await access.supabase
      .from("mindful_inventory_work_order_parts")
      .select("work_order_id,status,eta_at")
      .eq("work_order_id", workOrderId);
    if (partsError) throw new Error(partsError.message);
    const parts = summarizePartsReadiness(partRows || []);
    if (!parts.readyForExecution) {
      return NextResponse.json({ error: "All required parts must be received before scheduling.", latestEtaAt: parts.latestEtaAt }, { status: 409 });
    }

    const durationRaw = Number(work.estimated_elapsed_minutes ?? work.estimated_duration_minutes ?? 60);
    const durationMinutes = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : 60;
    const horizonStart = new Date();
    const horizonEnd = new Date(horizonStart.getTime() + 8 * 24 * 60 * 60_000);

    let query = access.supabase
      .from("mindful_inventory_work_orders")
      .select("id,assigned_partner_id,assigned_user_id,resource_id,scheduled_start_at,scheduled_end_at,status")
      .neq("id", workOrderId)
      .not("status", "in", '("complete","cancelled")')
      .not("scheduled_start_at", "is", null)
      .lt("scheduled_start_at", horizonEnd.toISOString())
      .gt("scheduled_end_at", horizonStart.toISOString());

    if (work.assigned_partner_id) query = query.eq("assigned_partner_id", work.assigned_partner_id);
    else if (work.assigned_user_id) query = query.eq("assigned_user_id", work.assigned_user_id);

    const { data: busyRows, error: busyError } = await query;
    if (busyError) throw new Error(busyError.message);

    const busy = (busyRows || [])
      .map((row) => ({
        start: row.scheduled_start_at ? new Date(row.scheduled_start_at).getTime() : NaN,
        end: row.scheduled_end_at ? new Date(row.scheduled_end_at).getTime() : NaN,
        resourceId: row.resource_id as string | null,
      }))
      .filter((row) => Number.isFinite(row.start) && Number.isFinite(row.end));

    const now = Date.now();
    const firstCandidate = new Date(Math.ceil((now + 30 * 60_000) / (30 * 60_000)) * 30 * 60_000);
    const firstLocal = localParts(firstCandidate, offsetMinutes);
    const suggestions: Array<{ startAt: string; endAt: string }> = [];

    for (let dayOffset = 0; dayOffset < 8 && suggestions.length < 6; dayOffset += 1) {
      const baseNoon = fromLocal(firstLocal.year, firstLocal.month, firstLocal.day + dayOffset, 12, 0, offsetMinutes);
      const p = localParts(baseNoon, offsetMinutes);
      if (p.weekday === 0 || p.weekday === 6) continue;

      for (let minuteOfDay = 8 * 60; minuteOfDay + durationMinutes <= 17 * 60 && suggestions.length < 6; minuteOfDay += 30) {
        const hour = Math.floor(minuteOfDay / 60);
        const minute = minuteOfDay % 60;
        const start = fromLocal(p.year, p.month, p.day, hour, minute, offsetMinutes);
        const end = new Date(start.getTime() + durationMinutes * 60_000);
        if (start.getTime() < firstCandidate.getTime()) continue;

        const conflict = busy.some((item) => {
          if (overlaps(start.getTime(), end.getTime(), item.start, item.end)) return true;
          return Boolean(work.resource_id && item.resourceId === work.resource_id && overlaps(start.getTime(), end.getTime(), item.start, item.end));
        });
        if (!conflict) suggestions.push({ startAt: start.toISOString(), endAt: end.toISOString() });
      }
    }

    return NextResponse.json({ durationMinutes, suggestions });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not calculate schedule availability." }, { status: 500 });
  }
}
