import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth";

export async function POST(request: Request, context: { params: Promise<{ workOrderId: string }> }) {
  try {
    const authClient = await createSupabaseServerAuthClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { workOrderId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const kind = String(body.kind || "");
    const action = String(body.action || "");
    const note = body.note == null ? null : String(body.note).trim().slice(0, 1000);
    if (!['location', 'parts'].includes(kind) || !['confirm', 'adjust'].includes(action)) {
      return NextResponse.json({ error: "Invalid logistics action." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: work, error: workError } = await admin
      .from("mindful_inventory_work_orders")
      .select("id,assigned_partner_id,status")
      .eq("id", workOrderId)
      .maybeSingle();
    if (workError) throw new Error(workError.message);
    if (!work?.assigned_partner_id) return NextResponse.json({ error: "Assigned Work Order not found." }, { status: 404 });
    if (["complete", "cancelled"].includes(work.status)) return NextResponse.json({ error: "This Work Order is closed." }, { status: 409 });

    const { data: partner, error: partnerError } = await admin
      .from("mindful_inventory_partners")
      .select("id,user_id,active")
      .eq("id", work.assigned_partner_id)
      .maybeSingle();
    if (partnerError) throw new Error(partnerError.message);
    if (!partner || !partner.active || partner.user_id !== user.id) {
      return NextResponse.json({ error: "You are not the assigned partner for this Work Order." }, { status: 403 });
    }

    const now = new Date().toISOString();
    const patch = kind === "location"
      ? {
          partner_location_confirmation_status: action === "confirm" ? "confirmed" : "adjustment_requested",
          partner_location_request: action === "adjust" ? note : null,
          updated_at: now,
          updated_by: user.id,
        }
      : {
          partner_parts_confirmation_status: action === "confirm" ? "confirmed" : "issue_reported",
          partner_parts_note: action === "adjust" ? note : null,
          updated_at: now,
          updated_by: user.id,
        };

    if (action === "adjust" && !note) {
      return NextResponse.json({ error: kind === "location" ? "Tell us what location needs to change." : "Tell us what is wrong with the parts." }, { status: 400 });
    }

    const { error: updateError } = await admin
      .from("mindful_inventory_work_orders")
      .update(patch)
      .eq("id", workOrderId)
      .eq("assigned_partner_id", partner.id);
    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ ok: true, kind, status: action === "confirm" ? "confirmed" : "adjustment_requested" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update logistics confirmation." }, { status: 500 });
  }
}
