import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

const levels = new Set(["presentation", "retail", "full", "restoration", "custom"]);
const statuses = new Set(["needs_setup", "awaiting_partner", "scheduled", "in_progress", "completed", "accepted"]);

function text(value: unknown) {
  const clean = String(value ?? "").trim();
  return clean || null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Numeric values must be zero or greater.");
  return parsed;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { id } = await context.params;
    const vehicleId = String(id || "").trim();
    const { data: vehicle } = await access.supabase
      .from("mindful_inventory_vehicles")
      .select("id,phase")
      .eq("id", vehicleId)
      .eq("company_id", access.company.companyId)
      .maybeSingle();
    if (!vehicle) return NextResponse.json({ error: "Inventory vehicle not found." }, { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;
    const detailLevel = String(body.detailLevel || "retail");
    if (!levels.has(detailLevel)) return NextResponse.json({ error: "Invalid detail level." }, { status: 400 });

    const requestedStatus = body.status === undefined ? null : String(body.status || "");
    if (requestedStatus && !statuses.has(requestedStatus)) return NextResponse.json({ error: "Invalid detailing status." }, { status: 400 });

    const partnerId = text(body.partnerId);
    if (partnerId) {
      const { data: partner } = await access.supabase
        .from("mindful_inventory_partners")
        .select("id")
        .eq("id", partnerId)
        .eq("company_id", access.company.companyId)
        .eq("active", true)
        .maybeSingle();
      if (!partner) return NextResponse.json({ error: "Detailing partner not found." }, { status: 400 });
    }

    const scopeItems = Array.isArray(body.scopeItems)
      ? body.scopeItems.map((item) => String(item).trim()).filter(Boolean).slice(0, 50)
      : [];
    const proposedStartAt = text(body.proposedStartAt);
    const scheduledStartAt = text(body.scheduledStartAt);
    const now = new Date().toISOString();
    const status = requestedStatus || (partnerId ? (scheduledStartAt ? "scheduled" : "awaiting_partner") : "needs_setup");

    const values: Record<string, unknown> = {
      vehicle_id: vehicleId,
      partner_id: partnerId,
      detail_level: detailLevel,
      scope_items: scopeItems,
      custom_scope: text(body.customScope),
      status,
      proposed_start_at: proposedStartAt,
      scheduled_start_at: scheduledStartAt,
      expected_turnaround_minutes: numberOrNull(body.expectedTurnaroundMinutes),
      quoted_cost: numberOrNull(body.quotedCost),
      actual_cost: numberOrNull(body.actualCost),
      notes: text(body.notes),
      partner_confirmation_status: partnerId ? (status === "scheduled" || status === "in_progress" || status === "completed" || status === "accepted" ? "confirmed" : "awaiting_partner") : null,
      updated_by: access.userId,
      updated_at: now,
    };

    if (status === "completed" || status === "accepted") values.completed_at = now;
    if (status === "accepted") {
      values.accepted_at = now;
      values.accepted_by = access.userId;
    }

    const { data: existing } = await access.supabase
      .from("mindful_inventory_detailing")
      .select("id")
      .eq("vehicle_id", vehicleId)
      .maybeSingle();

    let detailId: string;
    if (existing) {
      const { error } = await access.supabase.from("mindful_inventory_detailing").update(values).eq("id", existing.id);
      if (error) throw new Error(error.message);
      detailId = existing.id;
    } else {
      const { data, error } = await access.supabase
        .from("mindful_inventory_detailing")
        .insert({ ...values, created_by: access.userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      detailId = data.id;
    }

    if (status === "accepted" && vehicle.phase !== "final_qc" && vehicle.phase !== "merchandising" && vehicle.phase !== "ready") {
      await access.supabase
        .from("mindful_inventory_vehicles")
        .update({ phase: "final_qc", updated_by: access.userId, updated_at: now })
        .eq("id", vehicleId);
    } else if (["needs_setup", "awaiting_partner", "scheduled", "in_progress", "completed"].includes(status) && vehicle.phase === "reconditioning") {
      await access.supabase
        .from("mindful_inventory_vehicles")
        .update({ phase: "detailing", updated_by: access.userId, updated_at: now })
        .eq("id", vehicleId);
    }

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: "detailing_updated",
      entity_type: "detailing",
      entity_id: detailId,
      actor_user_id: access.userId,
      summary: status === "accepted" ? "Detailing accepted; vehicle moved to Final QC." : `Detailing updated: ${status.replaceAll("_", " ")}`,
      metadata: { partnerId, detailLevel, scopeItems, status, scheduledStartAt },
    });

    return NextResponse.json({ id: detailId, status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update detailing." }, { status: 500 });
  }
}
