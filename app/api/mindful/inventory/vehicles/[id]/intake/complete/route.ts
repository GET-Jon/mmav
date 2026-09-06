import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

const requiredConfirmationKeys = ["purchase_mileage", "title_status", "purchase_price"] as const;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) {
      return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });
    }

    const { id } = await context.params;
    const vehicleId = String(id || "").trim();
    if (!vehicleId) {
      return NextResponse.json({ error: "Inventory vehicle id is required." }, { status: 400 });
    }

    const { data: vehicle, error: vehicleError } = await access.supabase
      .from("mindful_inventory_vehicles")
      .select("id")
      .eq("id", vehicleId)
      .eq("company_id", access.company.companyId)
      .single();

    if (vehicleError || !vehicle) {
      return NextResponse.json({ error: "Inventory vehicle not found." }, { status: 404 });
    }

    const { data: intake, error: intakeError } = await access.supabase
      .from("mindful_inventory_intakes")
      .select("id,status,field_confirmations")
      .eq("vehicle_id", vehicleId)
      .maybeSingle();

    if (intakeError) {
      return NextResponse.json({ error: intakeError.message }, { status: 500 });
    }
    if (!intake) {
      return NextResponse.json({ error: "Complete the required Intake confirmations first." }, { status: 400 });
    }

    const confirmations =
      intake.field_confirmations && typeof intake.field_confirmations === "object" && !Array.isArray(intake.field_confirmations)
        ? intake.field_confirmations as Record<string, unknown>
        : {};
    const missing = requiredConfirmationKeys.filter((key) => !confirmations[key]);
    if (missing.length) {
      return NextResponse.json({ error: "Complete the required Intake confirmations first.", missing }, { status: 400 });
    }

    if (intake.status === "complete") {
      return NextResponse.json({ id: intake.id, status: "complete" });
    }

    const now = new Date().toISOString();
    const { error: updateError } = await access.supabase
      .from("mindful_inventory_intakes")
      .update({ status: "complete", completed_at: now, updated_at: now })
      .eq("id", intake.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: "intake_completed",
      entity_type: "intake",
      entity_id: intake.id,
      actor_user_id: access.userId,
      summary: "Purchaser intake completed before Mechanical handoff.",
      metadata: { source: "mechanical_handoff" },
    });

    return NextResponse.json({ id: intake.id, status: "complete", completedAt: now });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to complete Intake." },
      { status: 500 },
    );
  }
}
