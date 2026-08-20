import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

const allowedSources = new Set(["intake", "inspection", "ai", "partner", "manager", "qc", "other"]);
const allowedSeverities = new Set(["green", "yellow", "red"]);

function optionalText(value: unknown) {
  const clean = String(value ?? "").trim();
  return clean || null;
}

function nullableNonNegativeNumber(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be zero or greater.`);
  return parsed;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { id } = await context.params;
    const vehicleId = String(id || "").trim();
    if (!vehicleId) return NextResponse.json({ error: "Inventory vehicle id is required." }, { status: 400 });

    const { data: vehicle, error: vehicleError } = await access.supabase
      .from("mindful_inventory_vehicles")
      .select("id")
      .eq("id", vehicleId)
      .eq("company_id", access.company.companyId)
      .single();

    if (vehicleError || !vehicle) return NextResponse.json({ error: "Inventory vehicle not found." }, { status: 404 });

    const body = await request.json();
    const source = String(body.source || "manager");
    const severity = body.severity ? String(body.severity) : null;
    const title = String(body.title || "").trim();

    if (!title) return NextResponse.json({ error: "Finding title is required." }, { status: 400 });
    if (!allowedSources.has(source)) return NextResponse.json({ error: "Invalid finding source." }, { status: 400 });
    if (severity && !allowedSeverities.has(severity)) return NextResponse.json({ error: "Invalid finding severity." }, { status: 400 });

    const estimatedCostLow = nullableNonNegativeNumber(body.estimatedCostLow, "Estimated cost low");
    const estimatedCostHigh = nullableNonNegativeNumber(body.estimatedCostHigh, "Estimated cost high");
    if (estimatedCostLow !== null && estimatedCostHigh !== null && estimatedCostHigh < estimatedCostLow) {
      return NextResponse.json({ error: "Estimated cost high cannot be less than estimated cost low." }, { status: 400 });
    }

    const { data, error } = await access.supabase
      .from("mindful_inventory_findings")
      .insert({
        vehicle_id: vehicleId,
        intake_id: optionalText(body.intakeId),
        inspection_id: optionalText(body.inspectionId),
        source,
        source_user_id: access.userId,
        source_partner_id: null,
        title,
        description: optionalText(body.description),
        category: optionalText(body.category) || "other",
        subcategory: optionalText(body.subcategory),
        severity,
        confidence: optionalText(body.confidence),
        certainty: optionalText(body.certainty),
        estimated_cost_low: estimatedCostLow,
        estimated_cost_high: estimatedCostHigh,
        estimated_duration_hours: nullableNonNegativeNumber(body.estimatedDurationHours, "Estimated duration"),
        status: "open",
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: "finding_added",
      entity_type: "finding",
      entity_id: data.id,
      actor_user_id: access.userId,
      summary: `Finding added: ${title}`,
      metadata: { source, severity, category: optionalText(body.category) || "other" },
    });

    return NextResponse.json({ id: data.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to add finding." }, { status: 500 });
  }
}
