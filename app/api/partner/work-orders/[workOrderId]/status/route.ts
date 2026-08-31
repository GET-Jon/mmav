import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth";

export async function POST(
  request: Request,
  context: { params: Promise<{ workOrderId: string }> },
) {
  try {
    const authClient = await createSupabaseServerAuthClient();
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { workOrderId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const status = String(body.status || "").trim();
    if (status !== "in_progress" && status !== "complete") {
      return NextResponse.json({ error: "Partner status must be in_progress or complete." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: work, error: workError } = await admin
      .from("mindful_inventory_work_orders")
      .select("id,status,assigned_partner_id,actual_start_at,partner_estimate_status")
      .eq("id", workOrderId)
      .maybeSingle();

    if (workError) throw new Error(workError.message);
    if (!work?.assigned_partner_id) {
      return NextResponse.json({ error: "Assigned partner Work Order not found." }, { status: 404 });
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

    const { data: permissions, error: permissionsError } = await admin
      .from("mindful_inventory_partner_permissions")
      .select("view_assigned_work,start_work,complete_work")
      .eq("partner_id", partner.id)
      .maybeSingle();

    if (permissionsError) throw new Error(permissionsError.message);
    if (!permissions?.view_assigned_work) {
      return NextResponse.json({ error: "Assigned Work access is disabled." }, { status: 403 });
    }
    if (status === "in_progress" && !permissions.start_work) {
      return NextResponse.json({ error: "Starting Work Orders is not enabled for this partner." }, { status: 403 });
    }
    if (status === "complete" && !permissions.complete_work) {
      return NextResponse.json({ error: "Completing Work Orders is not enabled for this partner." }, { status: 403 });
    }

    if (["complete", "cancelled"].includes(work.status)) {
      return NextResponse.json({ error: "This Work Order is already closed." }, { status: 409 });
    }

    if (status === "in_progress" && !["approved", "not_required"].includes(work.partner_estimate_status || "")) {
      return NextResponse.json(
        { error: "Work cannot begin until the estimate is approved." },
        { status: 409 },
      );
    }

    if (status === "complete" && work.status !== "in_progress") {
      return NextResponse.json(
        { error: "Work must be started before it can be marked complete." },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status,
      updated_at: now,
      updated_by: user.id,
    };

    if (status === "in_progress") {
      patch.actual_start_at = work.actual_start_at || now;
    } else {
      patch.actual_start_at = work.actual_start_at || now;
      patch.actual_end_at = now;
      patch.completed_by_partner_id = partner.id;
      patch.completed_by_user_id = null;
    }

    const { data: updated, error: updateError } = await admin
      .from("mindful_inventory_work_orders")
      .update(patch)
      .eq("id", workOrderId)
      .eq("assigned_partner_id", partner.id)
      .select("id,status,actual_start_at,actual_end_at")
      .single();

    if (updateError) throw new Error(updateError.message);
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Work Order status could not be updated." },
      { status: 500 },
    );
  }
}
