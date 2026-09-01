import { NextResponse } from "next/server";

import { requirePartnerPortalAccess } from "@/lib/partner-portal/access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const allowedStatuses = new Set(["scheduled", "in_progress", "completed"]);

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Values must be zero or greater.");
  return parsed;
}

export async function PATCH(request: Request, context: { params: Promise<{ detailId: string }> }) {
  try {
    const access = await requirePartnerPortalAccess();
    const admin = createSupabaseAdminClient();
    const { detailId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    const { data: detail } = await admin
      .from("mindful_inventory_detailing")
      .select("id,vehicle_id,partner_id,status,scheduled_start_at")
      .eq("id", detailId)
      .eq("partner_id", access.partner.id)
      .maybeSingle();
    if (!detail) return NextResponse.json({ error: "Detailing assignment not found." }, { status: 404 });

    const updates: Record<string, unknown> = { updated_by: access.userId, updated_at: new Date().toISOString() };

    if (body.status !== undefined) {
      const status = String(body.status || "");
      if (!allowedStatuses.has(status)) return NextResponse.json({ error: "Invalid detailing status." }, { status: 400 });
      if (status === "in_progress" && !["scheduled", "in_progress"].includes(detail.status)) {
        return NextResponse.json({ error: "Detailing must be scheduled before it can begin." }, { status: 409 });
      }
      if (status === "completed" && detail.status !== "in_progress") {
        return NextResponse.json({ error: "Detailing must be in progress before completion." }, { status: 409 });
      }
      updates.status = status;
      if (status === "scheduled") updates.partner_confirmation_status = "confirmed";
      if (status === "completed") updates.completed_at = new Date().toISOString();
    }

    if (body.scheduledStartAt !== undefined) {
      const value = String(body.scheduledStartAt || "").trim();
      updates.scheduled_start_at = value || null;
      updates.partner_confirmation_status = value ? "confirmed" : "awaiting_partner";
      if (value && !body.status) updates.status = "scheduled";
    }
    if (body.expectedTurnaroundMinutes !== undefined) updates.expected_turnaround_minutes = numberOrNull(body.expectedTurnaroundMinutes);
    if (body.quotedCost !== undefined) updates.quoted_cost = numberOrNull(body.quotedCost);
    if (body.notes !== undefined) updates.notes = String(body.notes || "").trim() || null;

    const { error } = await admin.from("mindful_inventory_detailing").update(updates).eq("id", detail.id);
    if (error) throw new Error(error.message);

    await admin.from("mindful_inventory_history").insert({
      company_id: access.partner.companyId,
      vehicle_id: detail.vehicle_id,
      event_type: "partner_detailing_updated",
      entity_type: "detailing",
      entity_id: detail.id,
      actor_user_id: access.userId,
      summary: `${access.partner.name} updated the detailing assignment.`,
      metadata: updates,
    });

    return NextResponse.json({ id: detail.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update detailing." }, { status: 500 });
  }
}
