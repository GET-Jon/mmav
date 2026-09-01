import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

function cleanKey(value: unknown) {
  return String(value || "").trim();
}

export async function PATCH(
  request: Request,
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

    const body = await request.json();
    const key = cleanKey(body.key);
    if (!key) {
      return NextResponse.json({ error: "Confirmation key is required." }, { status: 400 });
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

    const { data: existing, error: existingError } = await access.supabase
      .from("mindful_inventory_intakes")
      .select("id,field_confirmations")
      .eq("vehicle_id", vehicleId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json(
        { error: "Save Intake before confirming individual fields." },
        { status: 409 },
      );
    }

    const confirmations =
      existing.field_confirmations &&
      typeof existing.field_confirmations === "object" &&
      !Array.isArray(existing.field_confirmations)
        ? { ...(existing.field_confirmations as Record<string, unknown>) }
        : {};

    if (body.confirmed === false) {
      delete confirmations[key];
    } else {
      confirmations[key] = {
        confirmedAt: new Date().toISOString(),
        value: body.value ?? null,
      };
    }

    const { error } = await access.supabase
      .from("mindful_inventory_intakes")
      .update({
        field_confirmations: confirmations,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: body.confirmed === false ? "intake_field_reopened" : "intake_field_confirmed",
      entity_type: "intake",
      entity_id: existing.id,
      actor_user_id: access.userId,
      summary:
        body.confirmed === false
          ? `Intake field reopened: ${key}.`
          : `Intake field confirmed: ${key}.`,
      metadata: { key, value: body.value ?? null },
    });

    return NextResponse.json({ fieldConfirmations: confirmations });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update intake confirmation." },
      { status: 500 },
    );
  }
}
