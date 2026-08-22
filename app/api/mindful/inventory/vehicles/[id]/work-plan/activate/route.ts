import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventoryCarPlanData } from "@/lib/mindful-inventory/car-plan";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { id } = await context.params;
    const vehicleId = String(id || "").trim();
    const body = await request.json().catch(() => ({}));

    const current = await getInventoryCarPlanData(access.supabase, vehicleId);
    const requestedVersionId = String(body.planVersionId || current.currentDraftVersion?.id || "").trim();
    if (!requestedVersionId) {
      return NextResponse.json({ error: "No Preliminary Work Plan is available to activate." }, { status: 400 });
    }

    const { data, error } = await access.supabase.rpc("activate_inventory_work_plan", {
      requested_vehicle_id: vehicleId,
      requested_plan_version_id: requestedVersionId,
      requested_company_id: access.company.companyId,
      requesting_user_id: access.userId,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      planVersionId: result?.returned_plan_version_id || requestedVersionId,
      workOrdersCreated: Number(result?.work_orders_created || 0),
      activated: Boolean(result?.activated),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to activate Work Plan." },
      { status: 500 },
    );
  }
}
