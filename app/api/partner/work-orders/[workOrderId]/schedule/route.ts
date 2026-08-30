import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth";

function validDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workOrderId: string }> },
) {
  try {
    const authClient = await createSupabaseServerAuthClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { workOrderId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const startAt = validDate(body.startAt);
    const endAt = validDate(body.endAt);
    if (startAt === undefined || endAt === undefined || !startAt || !endAt) {
      return NextResponse.json({ error: "Enter a valid start and completion time." }, { status: 400 });
    }
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      return NextResponse.json({ error: "Completion time must be after the start time." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: work, error: workError } = await admin
      .from("mindful_inventory_work_orders")
      .select("id,status,assigned_partner_id,scheduled_start_at,scheduled_end_at,proposed_start_at,proposed_end_at")
      .eq("id", workOrderId)
      .maybeSingle();
    if (workError) throw new Error(workError.message);
    if (!work?.assigned_partner_id) return NextResponse.json({ error: "Assigned Work Order not found." }, { status: 404 });
    if (["in_progress", "complete", "cancelled"].includes(work.status)) {
      return NextResponse.json({ error: "This Work Order can no longer be rescheduled here." }, { status: 409 });
    }

    const { data: partner, error: partnerError } = await admin
      .from("mindful_inventory_partners")
      .select("id,user_id,active")
      .eq("id", work.assigned_partner_id)
      .maybeSingle();
    if (partnerError) throw new Error(partnerError.message);
    if (!partner || !partner.active || partner.user_id !== user.id) {
      return NextResponse.json({ error: "You are not the assigned partner for this Work Order." }, { status: 403 });
    }

    const { data: permissions, error: permissionError } = await admin
      .from("mindful_inventory_partner_permissions")
      .select("view_assigned_work,reschedule_work")
      .eq("partner_id", partner.id)
      .maybeSingle();
    if (permissionError) throw new Error(permissionError.message);
    if (!permissions?.view_assigned_work || !permissions.reschedule_work) {
      return NextResponse.json({ error: "Schedule changes are not enabled for this partner." }, { status: 403 });
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await admin
      .from("mindful_inventory_work_orders")
      .update({
        proposed_start_at: work.proposed_start_at || work.scheduled_start_at,
        proposed_end_at: work.proposed_end_at || work.scheduled_end_at,
        scheduled_start_at: startAt,
        scheduled_end_at: endAt,
        partner_confirmation_status: "confirmed",
        schedule_source: "manual",
        status: work.status === "ready_to_schedule" ? "scheduled" : work.status,
        updated_at: now,
        updated_by: user.id,
      })
      .eq("id", workOrderId)
      .eq("assigned_partner_id", partner.id)
      .select("id,scheduled_start_at,scheduled_end_at,proposed_start_at,proposed_end_at,partner_confirmation_status")
      .single();
    if (updateError) throw new Error(updateError.message);

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Schedule could not be updated." },
      { status: 500 },
    );
  }
}
