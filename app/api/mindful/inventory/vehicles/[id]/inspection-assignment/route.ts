import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

function optionalText(value: unknown) {
  const clean = String(value ?? "").trim();
  return clean || null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { id } = await context.params;
    const vehicleId = String(id || "").trim();
    const body = await request.json().catch(() => ({}));
    const partnerId = String(body.partnerId || "").trim();
    if (!vehicleId || !partnerId) return NextResponse.json({ error: "Vehicle and inspector are required." }, { status: 400 });

    const { data: partner, error: partnerError } = await access.supabase
      .from("mindful_inventory_partners")
      .select("id,name,mechanical_inspection_eligible,default_inspection_fee")
      .eq("id", partnerId)
      .eq("company_id", access.company.companyId)
      .eq("active", true)
      .eq("portal_access_enabled", true)
      .maybeSingle();
    if (partnerError) throw new Error(partnerError.message);
    if (!partner || partner.mechanical_inspection_eligible !== true) return NextResponse.json({ error: "Selected partner is not eligible for mechanical inspections." }, { status: 400 });

    const now = new Date().toISOString();
    const requestedStartAt = optionalText(body.requestedStartAt);
    const inspectionFee = body.inspectionFee === "" || body.inspectionFee === null || body.inspectionFee === undefined ? partner.default_inspection_fee : Number(body.inspectionFee);

    const { data: existing } = await access.supabase
      .from("mindful_inventory_inspections")
      .select("id,status")
      .eq("vehicle_id", vehicleId)
      .eq("inspection_type", "mechanical")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let inspectionId: string;
    if (existing && !["complete", "cancelled"].includes(existing.status)) {
      const { data, error } = await access.supabase.from("mindful_inventory_inspections").update({ performed_by_user_id: null, performed_by_partner_id: partner.id, status: "assigned", requested_start_at: requestedStartAt, scheduled_start_at: null, scheduled_end_at: null, partner_confirmation_status: "pending", inspection_fee: inspectionFee, submitted_at: null, owner_review_status: null, owner_reviewed_at: null, owner_reviewed_by_user_id: null, revision_notes: null, updated_at: now }).eq("id", existing.id).select("id").single();
      if (error) throw new Error(error.message);
      inspectionId = data.id;
    } else {
      const { data, error } = await access.supabase.from("mindful_inventory_inspections").insert({ vehicle_id: vehicleId, inspection_type: "mechanical", performed_by_partner_id: partner.id, status: "assigned", requested_start_at: requestedStartAt, partner_confirmation_status: "pending", inspection_fee: inspectionFee, started_at: null, completed_at: null }).select("id").single();
      if (error) throw new Error(error.message);
      inspectionId = data.id;
    }

    await access.supabase.from("mindful_inventory_history").insert({ company_id: access.company.companyId, vehicle_id: vehicleId, event_type: "mechanical_inspection_assigned", entity_type: "inspection", entity_id: inspectionId, actor_user_id: access.userId, summary: `Mechanical inspection assigned to ${partner.name}.`, metadata: { partnerId: partner.id, requestedStartAt, inspectionFee } });

    return NextResponse.json({ inspectionId, partnerId: partner.id, assigned: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to assign mechanical inspection." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });
    const { id } = await context.params;
    const vehicleId = String(id || "").trim();
    const body = await request.json().catch(() => ({}));
    const decision = String(body.decision || "").trim();
    const now = new Date().toISOString();

    const { data: inspection, error } = await access.supabase.from("mindful_inventory_inspections").select("id,status,performed_by_partner_id").eq("vehicle_id", vehicleId).eq("inspection_type", "mechanical").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!inspection || inspection.status !== "submitted") return NextResponse.json({ error: "No submitted inspection is awaiting review." }, { status: 409 });

    if (decision === "accept") {
      const { error: updateError } = await access.supabase.from("mindful_inventory_inspections").update({ status: "complete", completed_at: now, owner_review_status: "accepted", owner_reviewed_at: now, owner_reviewed_by_user_id: access.userId, revision_notes: null, updated_at: now }).eq("id", inspection.id);
      if (updateError) throw new Error(updateError.message);
    } else if (decision === "revision") {
      const notes = optionalText(body.notes);
      if (!notes) return NextResponse.json({ error: "Add revision notes for the inspector." }, { status: 400 });
      const { error: updateError } = await access.supabase.from("mindful_inventory_inspections").update({ status: "revision_requested", owner_review_status: "revision_requested", owner_reviewed_at: now, owner_reviewed_by_user_id: access.userId, revision_notes: notes, updated_at: now }).eq("id", inspection.id);
      if (updateError) throw new Error(updateError.message);
    } else {
      return NextResponse.json({ error: "Review decision must be accept or revision." }, { status: 400 });
    }

    await access.supabase.from("mindful_inventory_history").insert({ company_id: access.company.companyId, vehicle_id: vehicleId, event_type: decision === "accept" ? "mechanical_inspection_owner_accepted" : "mechanical_inspection_revision_requested", entity_type: "inspection", entity_id: inspection.id, actor_user_id: access.userId, summary: decision === "accept" ? "Owner accepted the mechanical inspection." : "Owner requested mechanical inspection revision.", metadata: { decision, notes: body.notes || null } });
    return NextResponse.json({ inspectionId: inspection.id, decision });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to review mechanical inspection." }, { status: 500 });
  }
}
