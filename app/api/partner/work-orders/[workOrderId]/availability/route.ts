import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth";
import { summarizePartsReadiness } from "@/lib/mindful-inventory/parts-readiness";

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB;
}

function roundUp(date: Date, minutes = 30) {
  const step = minutes * 60_000;
  return new Date(Math.ceil(date.getTime() / step) * step);
}

export async function GET(_request: Request, context: { params: Promise<{ workOrderId: string }> }) {
  try {
    const authClient = await createSupabaseServerAuthClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { workOrderId } = await context.params;
    const admin = createSupabaseAdminClient();

    const { data: work, error: workError } = await admin
      .from("mindful_inventory_work_orders")
      .select("id,vehicle_id,assigned_partner_id,resource_id,estimated_elapsed_minutes,estimated_duration_minutes,partner_estimate_status,parts_review_status")
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
    if (!partner || !partner.active || partner.user_id !== user.id) {
      return NextResponse.json({ error: "You are not the assigned partner for this Work Order." }, { status: 403 });
    }

    const { data: partRows, error: partsError } = await admin
      .from("mindful_inventory_work_order_parts")
      .select("work_order_id,status,eta_at")
      .eq("work_order_id", workOrderId);
    if (partsError) throw new Error(partsError.message);
    const parts = summarizePartsReadiness(partRows || []);

    const { data: latestEstimate } = await admin
      .from("lot_logic_partner_blind_estimates")
      .select("estimated_elapsed_minutes")
      .eq("work_order_id", workOrderId)
      .eq("partner_id", partner.id)
      .order("revision_no", { ascending: false })
      .limit(1)
      .maybeSingle();

    const rawDuration = Number(latestEstimate?.estimated_elapsed_minutes ?? work.estimated_elapsed_minutes ?? work.estimated_duration_minutes ?? 60);
    const durationMinutes = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 60;

    const { data: companyVehicles, error: vehicleError } = await admin
      .from("mindful_inventory_vehicles")
      .select("id")
      .eq("company_id", partner.company_id);
    if (vehicleError) throw new Error(vehicleError.message);
    const vehicleIds = (companyVehicles || []).map((row) => row.id);

    const now = new Date();
    const horizonEnd = new Date(now.getTime() + 14 * 24 * 60 * 60_000);
    const { data: busyRows, error: busyError } = vehicleIds.length
      ? await admin
          .from("mindful_inventory_work_orders")
          .select("id,vehicle_id,assigned_partner_id,resource_id,scheduled_start_at,scheduled_end_at,proposed_start_at,proposed_end_at,status")
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
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > horizonEnd.getTime()) return [];
      return [{
        start,
        end,
        vehicleId: row.vehicle_id as string,
        partnerId: row.assigned_partner_id as string | null,
        resourceId: row.resource_id as string | null,
      }];
    });

    const suggestions: Array<{ startAt: string; endAt: string }> = [];
    const selectedByDay = new Map<string, number[]>();
    const cursor = roundUp(new Date(now.getTime() + 30 * 60_000));
    cursor.setMinutes(cursor.getMinutes() >= 30 ? 30 : 0, 0, 0);
    const etaFloor = parts.latestEtaAt ? new Date(parts.latestEtaAt).getTime() : null;

    for (let day = 0; day < 14 && suggestions.length < 6; day += 1) {
      const date = new Date(cursor);
      date.setDate(cursor.getDate() + day);
      const weekday = date.getDay();
      if (weekday === 0 || weekday === 6) continue;
      const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

      for (let minute = 8 * 60; minute + durationMinutes <= 17 * 60 && suggestions.length < 6; minute += 30) {
        const start = new Date(date);
        start.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
        if (start.getTime() < now.getTime() + 30 * 60_000) continue;
        if (etaFloor && !parts.readyForExecution && start.getTime() < etaFloor) continue;

        const daySelections = selectedByDay.get(dayKey) || [];
        if (daySelections.length >= 2) continue;
        if (daySelections.some((selected) => Math.abs(start.getTime() - selected) < 2 * 60 * 60_000)) continue;

        const end = new Date(start.getTime() + durationMinutes * 60_000);
        const conflict = busy.some((item) => {
          if (!overlaps(start.getTime(), end.getTime(), item.start, item.end)) return false;
          if (item.vehicleId === work.vehicle_id) return true;
          if (item.partnerId === partner.id) return true;
          if (work.resource_id && item.resourceId === work.resource_id) return true;
          return false;
        });
        if (conflict) continue;

        suggestions.push({ startAt: start.toISOString(), endAt: end.toISOString() });
        selectedByDay.set(dayKey, [...daySelections, start.getTime()]);
      }
    }

    const guidance: string[] = [];
    if (work.parts_review_status !== "resolved") guidance.push("parts review pending");
    else if (!parts.readyForExecution) guidance.push(parts.latestEtaAt ? "suggestions begin after the latest known parts ETA" : "parts readiness unknown");
    if (!["approved", "not_required"].includes(work.partner_estimate_status || "")) guidance.push("labor quote still pending");

    return NextResponse.json({ durationMinutes, suggestions, guidance: guidance.join(" · ") || null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not calculate schedule availability." }, { status: 500 });
  }
}
