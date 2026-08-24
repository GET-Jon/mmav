import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

const findingStatuses = new Set(["pending", "confirmed", "not_found", "changed", "needs_diagnosis"]);
const upgradeStatuses = new Set(["pending", "feasible", "feasible_with_changes", "not_recommended", "needs_info"]);

function optionalText(value: unknown) {
  const clean = String(value ?? "").trim();
  return clean || null;
}

export async function PATCH(
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

    const { data: inspection } = await access.supabase
      .from("mindful_inventory_inspections")
      .select("status")
      .eq("vehicle_id", vehicleId)
      .eq("inspection_type", "mechanical")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inspection?.status === "complete") {
      return NextResponse.json({ error: "Completed mechanical inspections cannot be changed." }, { status: 409 });
    }

    const body = await request.json();
    const kind = String(body.kind || "");
    const entityId = String(body.entityId || "").trim();
    const status = String(body.status || "");
    const notes = optionalText(body.notes);

    if (!entityId) return NextResponse.json({ error: "Validation item id is required." }, { status: 400 });

    if (kind === "finding") {
      if (!findingStatuses.has(status)) return NextResponse.json({ error: "Invalid finding validation status." }, { status: 400 });

      const { data: finding, error: findingError } = await access.supabase
        .from("mindful_inventory_findings")
        .select("id,title,source,status")
        .eq("id", entityId)
        .eq("vehicle_id", vehicleId)
        .single();

      if (findingError || !finding || finding.source !== "ai" || finding.status !== "open") {
        return NextResponse.json({ error: "Imported Lot Logic finding not found." }, { status: 404 });
      }

      const { error } = await access.supabase
        .from("mindful_inventory_findings")
        .update({ mechanical_validation_status: status, mechanical_validation_notes: notes, updated_at: new Date().toISOString() })
        .eq("id", entityId)
        .eq("vehicle_id", vehicleId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      await access.supabase.from("mindful_inventory_history").insert({
        company_id: access.company.companyId,
        vehicle_id: vehicleId,
        event_type: "mechanical_scope_validated",
        entity_type: "finding",
        entity_id: entityId,
        actor_user_id: access.userId,
        summary: `Mechanical validation updated: ${finding.title}`,
        metadata: { kind, status, notes },
      });

      return NextResponse.json({ id: entityId, status });
    }

    if (kind === "upgrade") {
      if (!upgradeStatuses.has(status)) return NextResponse.json({ error: "Invalid upgrade validation status." }, { status: 400 });

      const { data: upgrade, error: upgradeError } = await access.supabase
        .from("mindful_inventory_upgrades")
        .select("id,title,status")
        .eq("id", entityId)
        .eq("vehicle_id", vehicleId)
        .eq("company_id", access.company.companyId)
        .single();

      if (upgradeError || !upgrade || upgrade.status !== "proposed") {
        return NextResponse.json({ error: "Requested upgrade not found." }, { status: 404 });
      }

      const { error } = await access.supabase
        .from("mindful_inventory_upgrades")
        .update({ mechanical_validation_status: status, mechanical_validation_notes: notes, updated_by: access.userId, updated_at: new Date().toISOString() })
        .eq("id", entityId)
        .eq("vehicle_id", vehicleId)
        .eq("company_id", access.company.companyId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      await access.supabase.from("mindful_inventory_history").insert({
        company_id: access.company.companyId,
        vehicle_id: vehicleId,
        event_type: "mechanical_scope_validated",
        entity_type: "upgrade",
        entity_id: entityId,
        actor_user_id: access.userId,
        summary: `Upgrade validation updated: ${upgrade.title}`,
        metadata: { kind, status, notes },
      });

      return NextResponse.json({ id: entityId, status });
    }

    return NextResponse.json({ error: "Validation kind must be finding or upgrade." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update mechanical validation." }, { status: 500 });
  }
}
