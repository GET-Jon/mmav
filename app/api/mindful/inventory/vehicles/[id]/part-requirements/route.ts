import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

const fulfillmentMethods = new Set(["mindful_purchase", "partner_supplied", "in_stock", "customer_supplied", "not_required"]);
const sourcingOwners = new Set(["owner", "partner"]);
const requirementStatuses = new Set(["suggested", "required", "not_required"]);
const messageTypes = new Set(["note", "offer", "counter", "decision", "source"]);

function optionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}
function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Price values must be non-negative numbers.");
  return parsed;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { id } = await context.params;
    const vehicleId = String(id || "").trim();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "").trim();
    const requirementId = String(body.requirementId || "").trim();
    if (!requirementId) return NextResponse.json({ error: "Part requirement id is required." }, { status: 400 });

    const { data: requirement, error: requirementError } = await access.supabase
      .from("mindful_inventory_part_requirements")
      .select("id,company_id,vehicle_id,work_order_id,linked_part_id,description,quantity,part_number,requirement_status,fulfillment_method")
      .eq("id", requirementId)
      .eq("vehicle_id", vehicleId)
      .eq("company_id", access.company.companyId)
      .maybeSingle();
    if (requirementError) throw new Error(requirementError.message);
    if (!requirement) return NextResponse.json({ error: "Part requirement not found." }, { status: 404 });

    if (action === "message") {
      const messageType = String(body.messageType || "note").trim();
      const message = optionalText(body.message);
      if (!message || !messageTypes.has(messageType)) return NextResponse.json({ error: "Enter a valid parts conversation message." }, { status: 400 });
      const { error } = await access.supabase.from("mindful_inventory_part_requirement_messages").insert({
        requirement_id: requirement.id,
        actor_type: "owner",
        actor_user_id: access.userId,
        message_type: messageType,
        body: message,
        unit_price: optionalNumber(body.unitPrice),
        source_url: optionalText(body.sourceUrl),
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action !== "decision") return NextResponse.json({ error: "Unsupported part requirement action." }, { status: 400 });

    const requirementStatus = String(body.requirementStatus || requirement.requirement_status || "suggested").trim();
    const fulfillmentMethod = optionalText(body.fulfillmentMethod);
    const sourcingOwner = optionalText(body.sourcingOwner);
    if (!requirementStatuses.has(requirementStatus)) return NextResponse.json({ error: "Invalid requirement status." }, { status: 400 });
    if (fulfillmentMethod && !fulfillmentMethods.has(fulfillmentMethod)) return NextResponse.json({ error: "Invalid fulfillment method." }, { status: 400 });
    if (sourcingOwner && !sourcingOwners.has(sourcingOwner)) return NextResponse.json({ error: "Invalid sourcing owner." }, { status: 400 });

    const low = optionalNumber(body.ownerTargetUnitPriceLow);
    const high = optionalNumber(body.ownerTargetUnitPriceHigh);
    if (low !== null && high !== null && high < low) return NextResponse.json({ error: "Target price high must be at least the target price low." }, { status: 400 });

    const normalizedStatus = fulfillmentMethod === "not_required" ? "not_required" : requirementStatus;
    const normalizedOwner = fulfillmentMethod === "partner_supplied" ? "partner" : fulfillmentMethod === "mindful_purchase" ? "owner" : sourcingOwner;
    const note = optionalText(body.ownerDecisionNote);
    const now = new Date().toISOString();

    const { error: updateError } = await access.supabase.from("mindful_inventory_part_requirements").update({
      requirement_status: normalizedStatus,
      fulfillment_method: fulfillmentMethod,
      sourcing_owner: normalizedOwner,
      owner_target_unit_price_low: low,
      owner_target_unit_price_high: high,
      owner_decision_note: note,
      updated_by: access.userId,
      updated_at: now,
    }).eq("id", requirement.id);
    if (updateError) throw new Error(updateError.message);

    let linkedPartId = requirement.linked_part_id as string | null;
    if (normalizedStatus === "required" && requirement.work_order_id && fulfillmentMethod !== "not_required") {
      if (!linkedPartId) {
        const dependencyResolution = fulfillmentMethod === "in_stock" ? "in_stock" : fulfillmentMethod === "partner_supplied" ? "partner_supplied" : fulfillmentMethod === "customer_supplied" ? "customer_supplied" : null;
        const { data: part, error: partError } = await access.supabase.from("mindful_inventory_work_order_parts").insert({
          work_order_id: requirement.work_order_id,
          requirement_id: requirement.id,
          description: requirement.description,
          quantity: requirement.quantity,
          part_number: requirement.part_number,
          status: "needed",
          dependency_resolution: dependencyResolution,
          dependency_resolved_at: dependencyResolution ? now : null,
          dependency_resolved_by: dependencyResolution ? access.userId : null,
          notes: note,
          created_by: access.userId,
          updated_by: access.userId,
        }).select("id").single();
        if (partError) throw new Error(partError.message);
        linkedPartId = part.id;
        const { error: linkError } = await access.supabase.from("mindful_inventory_part_requirements").update({ linked_part_id: linkedPartId }).eq("id", requirement.id);
        if (linkError) throw new Error(linkError.message);
      }
    }

    if (normalizedStatus === "not_required" && linkedPartId) {
      const { error: cancelError } = await access.supabase.from("mindful_inventory_work_order_parts").update({ status: "cancelled", updated_by: access.userId, updated_at: now }).eq("id", linkedPartId);
      if (cancelError) throw new Error(cancelError.message);
    }

    const decisionLabel = fulfillmentMethod === "partner_supplied" ? "Partner will supply" : fulfillmentMethod === "mindful_purchase" ? "Owner will source" : fulfillmentMethod === "in_stock" ? "Use in-stock part" : fulfillmentMethod === "customer_supplied" ? "Other supplied" : fulfillmentMethod === "not_required" ? "Not required" : normalizedStatus === "required" ? "Required" : "Still suggested";
    const target = low !== null || high !== null ? ` Target ${low !== null ? `$${low}` : ""}${low !== null && high !== null ? "–" : ""}${high !== null ? `$${high}` : ""}.` : "";
    const { error: messageError } = await access.supabase.from("mindful_inventory_part_requirement_messages").insert({
      requirement_id: requirement.id,
      actor_type: "owner",
      actor_user_id: access.userId,
      message_type: "decision",
      body: `${decisionLabel}.${target}${note ? ` ${note}` : ""}`.trim(),
      unit_price: high ?? low,
    });
    if (messageError) throw new Error(messageError.message);

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: "part_requirement_decision",
      entity_type: "part_requirement",
      entity_id: requirement.id,
      actor_user_id: access.userId,
      summary: `${requirement.description}: ${decisionLabel}.`,
      metadata: { requirementStatus: normalizedStatus, fulfillmentMethod, sourcingOwner: normalizedOwner, linkedPartId },
    });

    return NextResponse.json({ ok: true, requirementId: requirement.id, linkedPartId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update part requirement." }, { status: 500 });
  }
}
