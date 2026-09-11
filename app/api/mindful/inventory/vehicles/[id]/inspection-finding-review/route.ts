import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { summarizeFindingApprovalCost } from "@/lib/mindful-inventory/finding-approval";

type RawSuggestedPart = {
  description: string;
  quantity: number;
  partNumber: string | null;
  notes: string | null;
  aiEstimatedUnitPriceLow: number | null;
  aiEstimatedUnitPriceHigh: number | null;
  aiPriceBasis: string | null;
  partnerOfferUnitPrice: number | null;
};

function optionalText(value: unknown) {
  const clean = String(value ?? "").trim();
  return clean || null;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSuggestedParts(value: unknown): RawSuggestedPart[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const description = String(row.description ?? row.name ?? "").trim();
    if (!description) return [];
    const quantityValue = Number(row.quantity ?? 1);
    let low = optionalNumber(row.aiEstimatedUnitPriceLow ?? row.estimatedUnitPriceLow);
    let high = optionalNumber(row.aiEstimatedUnitPriceHigh ?? row.estimatedUnitPriceHigh);
    if (low !== null && high !== null && high < low) [low, high] = [high, low];
    return [{
      description,
      quantity: Number.isFinite(quantityValue) && quantityValue > 0 ? quantityValue : 1,
      partNumber: optionalText(row.partNumber ?? row.part_number),
      notes: optionalText(row.notes),
      aiEstimatedUnitPriceLow: low,
      aiEstimatedUnitPriceHigh: high,
      aiPriceBasis: optionalText(row.aiPriceBasis ?? row.priceBasis),
      partnerOfferUnitPrice: optionalNumber(row.partnerOfferUnitPrice),
    }];
  });
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
      .select("id,title,status,source,mechanical_can_perform,mechanical_labor_hours,mechanical_proposed_labor_price,mechanical_part_suggestions")
      .eq("id", findingId)
      .eq("vehicle_id", vehicleId)
      .in("source", ["ai", "partner"])
      .maybeSingle();
    if (findingError) throw new Error(findingError.message);
    if (!finding) return NextResponse.json({ error: "Mechanical finding not found." }, { status: 404 });

    const suggestedParts = normalizeSuggestedParts(finding.mechanical_part_suggestions);
    const approvalCost = summarizeFindingApprovalCost(
      optionalNumber(finding.mechanical_proposed_labor_price),
      suggestedParts,
    );

    let preferredPartnerId: string | null = null;
    if (decision === "accept") {
      if (!approvalCost.pricingComplete || approvalCost.totalHigh === null) {
        return NextResponse.json({ error: "Complete labor and required part pricing before approving this repair and its spend." }, { status: 400 });
      }

      if (finding.mechanical_can_perform === true) {
        if (!inspection.performed_by_partner_id) {
          return NextResponse.json({ error: "The mechanic who offered to perform this repair could not be identified." }, { status: 409 });
        }
        preferredPartnerId = inspection.performed_by_partner_id;
      } else if (finding.mechanical_can_perform === false) {
        if (!alternatePartnerId) {
          return NextResponse.json({ error: "Choose the alternate partner who should handle this accepted repair." }, { status: 400 });
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
    const summary = decision === "accept"
      ? `Owner approved mechanical repair: ${finding.title} for up to $${approvalCost.totalHigh?.toFixed(2)}.`
      : decision === "dismiss"
        ? `Owner dismissed mechanical finding: ${finding.title}.`
        : `Owner requested clarification on mechanical finding: ${finding.title}.`;
    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: eventType,
      entity_type: "finding",
      entity_id: finding.id,
      actor_user_id: access.userId,
      summary,
      metadata: {
        findingId: finding.id,
        decision,
        notes,
        assignedPartnerId: preferredPartnerId,
        authorization: decision === "accept" ? {
          laborHours: optionalNumber(finding.mechanical_labor_hours),
          laborPrice: approvalCost.laborPrice,
          partsCostLow: approvalCost.partsLow,
          partsCostHigh: approvalCost.partsHigh,
          totalLow: approvalCost.totalLow,
          totalHigh: approvalCost.totalHigh,
          usesAiPartEstimate: approvalCost.usesAiPartEstimate,
          usesPartnerPartPrice: approvalCost.usesPartnerPartPrice,
        } : null,
      },
    });

    return NextResponse.json({
      findingId: finding.id,
      reviewStatus,
      assignedPartnerId: preferredPartnerId,
      authorization: decision === "accept" ? {
        totalLow: approvalCost.totalLow,
        totalHigh: approvalCost.totalHigh,
      } : null,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to review mechanical finding." }, { status: 500 });
  }
}
