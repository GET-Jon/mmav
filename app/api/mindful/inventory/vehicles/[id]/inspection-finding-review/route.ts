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
    if (!vehicleId || !findingId) return NextResponse.json({ error: "Vehicle and finding are required." }, { status: 400 });
    if (!["accept", "dismiss"].includes(decision)) return NextResponse.json({ error: "Decision must be accept or dismiss." }, { status: 400 });

    const { data: inspection, error: inspectionError } = await access.supabase
      .from("mindful_inventory_inspections")
      .select("id,status")
      .eq("vehicle_id", vehicleId)
      .eq("inspection_type", "mechanical")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inspectionError) throw new Error(inspectionError.message);
    if (!inspection || inspection.status !== "submitted") return NextResponse.json({ error: "Findings can only be reviewed after the mechanic submits the inspection." }, { status: 409 });

    const { data: finding, error: findingError } = await access.supabase
      .from("mindful_inventory_findings")
      .select("id,title,status,source")
      .eq("id", findingId)
      .eq("vehicle_id", vehicleId)
      .in("source", ["ai", "partner"])
      .maybeSingle();
    if (findingError) throw new Error(findingError.message);
    if (!finding) return NextResponse.json({ error: "Mechanical finding not found." }, { status: 404 });

    const now = new Date().toISOString();
    const accepted = decision === "accept";
    const updateRow = {
      mechanical_owner_review_status: accepted ? "accepted" : "dismissed",
      mechanical_owner_review_notes: optionalText(body.notes),
      mechanical_owner_reviewed_at: now,
      mechanical_owner_reviewed_by_user_id: access.userId,
      status: accepted ? "open" : "dismissed",
      resolved_at: accepted ? null : now,
      updated_at: now,
    };

    const { error: updateError } = await access.supabase.from("mindful_inventory_findings").update(updateRow).eq("id", finding.id);
    if (updateError) throw new Error(updateError.message);

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: accepted ? "mechanical_finding_owner_accepted" : "mechanical_finding_owner_dismissed",
      entity_type: "finding",
      entity_id: finding.id,
      actor_user_id: access.userId,
      summary: accepted ? `Owner accepted mechanical finding: ${finding.title}.` : `Owner dismissed mechanical finding: ${finding.title}.`,
      metadata: { findingId: finding.id, decision, notes: optionalText(body.notes) },
    });

    return NextResponse.json({ findingId: finding.id, reviewStatus: updateRow.mechanical_owner_review_status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to review mechanical finding." }, { status: 500 });
  }
}
