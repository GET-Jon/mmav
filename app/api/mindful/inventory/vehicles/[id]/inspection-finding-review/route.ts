import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

function optionalText(value: unknown) {
  const clean = String(value ?? "").trim();
  return clean || null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { id } = await context.params;
    const vehicleId = String(id || "").trim();
    const body = await request.json().catch(() => ({}));
    const findingId = String(body.findingId || "").trim();
    const decision = String(body.decision || "").trim();
    const notes = optionalText(body.notes);
    const alternatePartnerId = optionalText(body.alternatePartnerId);
    if (!vehicleId || !findingId) return NextResponse.json({ error: "Vehicle and finding are required." }, { status: 400 });
    if (!["accept", "dismiss", "clarification"].includes(decision)) return NextResponse.json({ error: "Decision must be accept, clarification, or dismiss." }, { status: 400 });
    if (decision === "clarification" && !notes) return NextResponse.json({ error: "Add a question or clarification note for the inspector." }, { status: 400 });

    const { data: inspection, error: inspectionError } = await access.supabase
      .from("mindful_inventory_inspections")
      .select("id,status,performed_by_partner_id")
      .eq("vehicle_id", vehicleId)
      .eq("inspection_type", "mechanical")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inspectionError) throw new Error(inspectionError.message);
    if (!inspection || inspection.status !== "submitted") return NextResponse.json({ error: "Findings can only be reviewed after the mechanic submits the inspection." }, { status: 409 });

    const { data: finding, error: findingError } = await access.supabase
      .from("mindful_inventory_findings")
      .select("id,title,status,source,mechanical_can_perform")
      .eq("id", findingId)
      .eq("vehicle_id", vehicleId)
      .in("source", ["ai", "partner"])
      .maybeSingle();
    if (findingError) throw new Error(findingError.message);
    if (!finding) return NextResponse.json({ error: "Mechanical finding not found." }, { status: 404 });

    let preferredPartnerId: string | null = null;
    if (decision === "accept" && finding.mechanical_can_perform === false) {
      if (!alternatePartnerId) {
        return NextResponse.json({ error: "Choose the alternate partner who should handle this accepted finding." }, { status: 400 });
      }
      if (inspection.performed_by_partner_id && alternatePartnerId === inspection.performed_by_partner_id) {
        return NextResponse.json({ error: "The inspector said they cannot perform this work. Choose a different partner." }, { status: 400 });
      }
      const { data: partner, error: partnerError } = await access.supabase
        .from("mindful_inventory_partners")
        .select("id")
        .eq("id", alternatePartnerId)
        .eq("company_id", access.company.companyId)
        .eq("active", true)
        .maybeSingle();
      if (partnerError) throw new Error(partnerError.message);
      if (!partner) return NextResponse.json({ error: "Selected alternate partner is not available." }, { status: 400 });
      preferredPartnerId = partner.id;
    }

    const now = new Date().toISOString();
    const reviewStatus = decision === "accept" ? "accepted" : decision === "dismiss" ? "dismissed" : "clarification_requested";
    const updateRow = {
      mechanical_owner_review_status: reviewStatus,
      mechanical_owner_review_notes: notes,
      mechanical_owner_reviewed_at: now,
      mechanical_owner_reviewed_by_user_id: access.userId,
      owner_preferred_partner_id: decision === "accept" ? preferredPartnerId : null,
      status: decision === "dismiss" ? "dismissed" : "open",
      resolved_at: decision === "dismiss" ? now : null,
      updated_at: now,
    };

    const { error: updateError } = await access.supabase.from("mindful_inventory_findings").update(updateRow).eq("id", finding.id);
    if (updateError) throw new Error(updateError.message);

    const eventType = decision === "accept" ? "mechanical_finding_owner_accepted" : decision === "dismiss" ? "mechanical_finding_owner_dismissed" : "mechanical_finding_clarification_requested";
    const summary = decision === "accept" ? `Owner accepted mechanical finding: ${finding.title}.` : decision === "dismiss" ? `Owner dismissed mechanical finding: ${finding.title}.` : `Owner requested clarification on mechanical finding: ${finding.title}.`;
    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: eventType,
      entity_type: "finding",
      entity_id: finding.id,
      actor_user_id: access.userId,
      summary,
      metadata: { findingId: finding.id, decision, notes, alternatePartnerId: preferredPartnerId },
    });

    return NextResponse.json({ findingId: finding.id, reviewStatus, alternatePartnerId: preferredPartnerId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to review mechanical finding." }, { status: 500 });
  }
}
