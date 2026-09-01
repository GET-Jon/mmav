import { NextResponse } from "next/server";

import { getPartnerPortalAccess } from "@/lib/partner-portal/access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type PartnerPartAction = "partner_supplied" | "received" | "delayed";

const allowedActions = new Set<PartnerPartAction>([
  "partner_supplied",
  "received",
  "delayed",
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ workOrderId: string; partId: string }> },
) {
  try {
    const access = await getPartnerPortalAccess();
    if (!access) {
      return NextResponse.json({ error: "Partner access denied." }, { status: 403 });
    }
    if (!access.permissions.updateParts) {
      return NextResponse.json({ error: "Parts updates are not enabled for this account." }, { status: 403 });
    }

    const { workOrderId, partId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "") as PartnerPartAction;
    if (!allowedActions.has(action)) {
      return NextResponse.json({ error: "Choose a valid parts action." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: work, error: workError } = await admin
      .from("mindful_inventory_work_orders")
      .select("id,vehicle_id,title,assigned_partner_id,status")
      .eq("id", workOrderId)
      .eq("assigned_partner_id", access.partner.id)
      .maybeSingle();
    if (workError) throw new Error(workError.message);
    if (!work) return NextResponse.json({ error: "Assigned Work Order not found." }, { status: 404 });

    const { data: part, error: partError } = await admin
      .from("mindful_inventory_work_order_parts")
      .select("id,work_order_id,description,status,dependency_resolution")
      .eq("id", partId)
      .eq("work_order_id", work.id)
      .maybeSingle();
    if (partError) throw new Error(partError.message);
    if (!part) return NextResponse.json({ error: "Part not found for this Work Order." }, { status: 404 });

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      updated_by: access.userId,
      updated_at: now,
    };
    let summary = "";

    if (action === "partner_supplied") {
      patch.dependency_resolution = "partner_supplied";
      patch.dependency_resolved_at = now;
      patch.dependency_resolved_by = access.userId;
      patch.status = "received";
      patch.received_at = now;
      summary = `${part.description}: partner will supply this part.`;
    } else if (action === "received") {
      patch.status = "received";
      patch.received_at = now;
      summary = `${part.description}: partner marked part received.`;
    } else {
      patch.status = "backordered";
      summary = `${part.description}: partner reported a delay.`;
    }

    const { error: updateError } = await admin
      .from("mindful_inventory_work_order_parts")
      .update(patch)
      .eq("id", part.id);
    if (updateError) throw new Error(updateError.message);

    await admin.from("mindful_inventory_history").insert({
      company_id: access.partner.companyId,
      vehicle_id: work.vehicle_id,
      event_type: "partner_part_updated",
      entity_type: "work_order_part",
      entity_id: part.id,
      actor_user_id: access.userId,
      summary,
      metadata: {
        partnerId: access.partner.id,
        partnerName: access.partner.name,
        workOrderId: work.id,
        workOrderTitle: work.title,
        action,
        previousStatus: part.status,
        previousResolution: part.dependency_resolution,
      },
    });

    return NextResponse.json({ ok: true, action });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update part." },
      { status: 500 },
    );
  }
}
