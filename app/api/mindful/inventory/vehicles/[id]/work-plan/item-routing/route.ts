import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { id } = await context.params;
    const vehicleId = String(id || "").trim();
    const body = (await request.json()) as { itemId?: string; suggestedPartnerId?: string | null };
    const itemId = String(body.itemId || "").trim();
    const suggestedPartnerId = body.suggestedPartnerId ? String(body.suggestedPartnerId).trim() : null;
    if (!vehicleId || !itemId) return NextResponse.json({ error: "Vehicle and Work Plan item are required." }, { status: 400 });

    const { data: plan, error: planError } = await access.supabase
      .from("mindful_inventory_car_plans")
      .select("id")
      .eq("vehicle_id", vehicleId)
      .maybeSingle();
    if (planError) throw new Error(planError.message);
    if (!plan) return NextResponse.json({ error: "Work Plan not found." }, { status: 404 });

    const { data: version, error: versionError } = await access.supabase
      .from("mindful_inventory_car_plan_versions")
      .select("id")
      .eq("car_plan_id", plan.id)
      .eq("status", "draft")
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (versionError) throw new Error(versionError.message);
    if (!version) return NextResponse.json({ error: "No editable Work Plan exists." }, { status: 409 });

    if (suggestedPartnerId) {
      const { data: partner, error: partnerError } = await access.supabase
        .from("mindful_inventory_partners")
        .select("id")
        .eq("id", suggestedPartnerId)
        .eq("company_id", access.company.companyId)
        .eq("active", true)
        .maybeSingle();
      if (partnerError) throw new Error(partnerError.message);
      if (!partner) return NextResponse.json({ error: "Selected partner is unavailable." }, { status: 400 });
    }

    const { data: item, error: itemError } = await access.supabase
      .from("mindful_inventory_plan_items")
      .select("id,title")
      .eq("id", itemId)
      .eq("plan_version_id", version.id)
      .maybeSingle();
    if (itemError) throw new Error(itemError.message);
    if (!item) return NextResponse.json({ error: "Work Plan item not found." }, { status: 404 });

    const { error: updateError } = await access.supabase
      .from("mindful_inventory_plan_items")
      .update({ suggested_partner_id: suggestedPartnerId, updated_at: new Date().toISOString() })
      .eq("id", itemId)
      .eq("plan_version_id", version.id);
    if (updateError) throw new Error(updateError.message);

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: vehicleId,
      event_type: "work_plan_routing_updated",
      entity_type: "plan_item",
      entity_id: itemId,
      actor_user_id: access.userId,
      summary: suggestedPartnerId ? `Partner selected for ${item.title}.` : `Partner cleared for ${item.title}.`,
      metadata: { suggestedPartnerId },
    });

    return NextResponse.json({ itemId, suggestedPartnerId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update Work Plan routing." }, { status: 500 });
  }
}
