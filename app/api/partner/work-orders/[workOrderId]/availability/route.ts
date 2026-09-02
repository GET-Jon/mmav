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

export async function GET(request: Request, context: { params: Promise<{ workOrderId: string }> }) {
  try {
    const authClient = await createSupabaseServerAuthClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { workOrderId } = await context.params;
    const admin = createSupabaseAdminClient();

    const { data: work, error: workError } = await admin
      .from("mindful_inventory_work_orders")
      .select("id,assigned_partner_id,resource_id,location_id,estimated_elapsed_minutes,estimated_duration_minutes,partner_estimate_status,parts_review_status")
      .eq("id", workOrderId)
      .maybeSingle();
    if (workError) throw new Error(workError.message);
    if (!work?.assigned_partner_id) return NextResponse.json({ error: "Assigned Work Order not found." }, { status: 404 });

    const { data: partner, error: partnerError } = await admin
      .from("mindful_inventory_partners")
      .select("id,user_id,active")
      .eq("id", work.assigned_partner_id)
      .maybeSingle();
    if (partnerError) throw new Error(partnerError.message);
    if (!partner || !partner.active || partner.user_id !== user.id) {
      return NextResponse.json({ error: "You are not the assigned partner for this Work Order." }, { status: 403 });
    }

    if (work.parts_review_status !== "resolved") return NextResponse.json({ error: "Parts Review is not complete." }, { status: 409 });
    if (!work.location_id) return NextResponse.json({ error: "The dealer has not set the work location yet." }, { status: 409 });
    if (!["approved", "not_required"].includes(work.partner_estimate_status || "")) {
      return NextResponse.json({ error: "Your labor estimate must be approved before scheduling." }, { status: 409 });
    }

    const { data: partRows, error: partsError } = await admin
      .from("mindful_inventory_work_order_parts")
      .select("work_order_id,status,eta_at")
      .eq("work_order_id", workOrderId);
    if (partsError) throw new Error(partsError.message);
    const parts = summarizePartsReadiness(partRows || []);
    if (!parts.readyForExecution) {
      return NextResponse.json({ error: "All required parts must be ready before scheduling.", latestEtaAt: parts.latestEtaAt }, { status: 409 });
    }

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

    const now = new Date();
    const horizonEnd = new Date(now.getTime() + 10 * 24 * 60 * 60_000);
    const { data: busyRows, error: busyError } = await admin
      .from("mindful_inventory_work_orders")
      .select("id,scheduled_start_at,scheduled_end_at,resource_id")
      .eq("assigned_partner_id", partner.id)
      .neq("id", workOrderId)
      .not("status", "in", '("complete","cancelled")')
      .not("scheduled_start_at", "is", null)
      .lt("scheduled_start_at", horizonEnd.toISOString());
    if (busyError) throw new Error(busyError.message);

    const busy = (busyRows || []).flatMap((row) => {
      if (!row.scheduled_start_at || !row.scheduled_end_at) return [];
      const start = new Date(row.scheduled_start_at).getTime();
      const end = new Date(row.scheduled_end_at).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
      return [{ start, end, resourceId: row.resource_id as string | null }];
    });

    const suggestions: Array<{ startAt: string; endAt: string }> = [];
    const cursor = roundUp(new Date(now.getTime() + 30 * 60_000));
    cursor.setMinutes(cursor.getMinutes() >= 30 ? 30 : 0, 0, 0);

    for (let day = 0; day < 10 && suggestions.length < 6; day += 1) {
      const date = new Date(cursor);
      date.setDate(cursor.getDate() + day);
      const weekday = date.getDay();
      if (weekday === 0 || weekday === 6) continue;

      for (let minute = 8 * 60; minute + durationMinutes <= 17 * 60 && suggestions.length < 6; minute += 30) {
        const start = new Date(date);
        start.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
        if (start.getTime() < now.getTime() + 30 * 60_000) continue;
        const end = new Date(start.getTime() + durationMinutes * 60_000);
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
