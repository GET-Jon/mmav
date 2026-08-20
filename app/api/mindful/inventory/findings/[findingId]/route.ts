import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

const allowedStatuses = new Set(["open", "resolved", "dismissed"]);
const allowedSeverities = new Set(["green", "yellow", "red"]);

function optionalText(value: unknown) {
  const clean = String(value ?? "").trim();
  return clean || null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ findingId: string }> },
) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { findingId } = await context.params;
    const body = await request.json();

    const { data: finding, error: findingError } = await access.supabase
      .from("mindful_inventory_findings")
      .select("id,vehicle_id,title")
      .eq("id", findingId)
      .single();

    if (findingError || !finding) return NextResponse.json({ error: "Finding not found." }, { status: 404 });

    const { data: vehicle, error: vehicleError } = await access.supabase
      .from("mindful_inventory_vehicles")
      .select("id")
      .eq("id", finding.vehicle_id)
      .eq("company_id", access.company.companyId)
      .single();

    if (vehicleError || !vehicle) return NextResponse.json({ error: "Finding not found." }, { status: 404 });

    const status = String(body.status || "open");
    const severity = body.severity ? String(body.severity) : null;
    if (!allowedStatuses.has(status)) return NextResponse.json({ error: "Invalid finding status." }, { status: 400 });
    if (severity && !allowedSeverities.has(severity)) return NextResponse.json({ error: "Invalid finding severity." }, { status: 400 });

    const title = String(body.title || finding.title).trim();
    if (!title) return NextResponse.json({ error: "Finding title is required." }, { status: 400 });

    const now = new Date().toISOString();
    const { error } = await access.supabase
      .from("mindful_inventory_findings")
      .update({
        title,
        description: optionalText(body.description),
        category: optionalText(body.category) || "other",
        subcategory: optionalText(body.subcategory),
        severity,
        status,
        resolved_at: status === "open" ? null : now,
        updated_at: now,
      })
      .eq("id", findingId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: finding.vehicle_id,
      event_type: "finding_updated",
      entity_type: "finding",
      entity_id: findingId,
      actor_user_id: access.userId,
      summary: `Finding updated: ${title}`,
      metadata: { status, severity },
    });

    return NextResponse.json({ id: findingId, status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update finding." }, { status: 500 });
  }
}
