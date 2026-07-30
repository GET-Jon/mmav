import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type ImportResult = {
  returned_evaluation_id: string;
  returned_inventory_vehicle_id: string;
  returned_status: string;
  inventory_created: boolean;
};

export async function POST(request: Request) {
  try {
    const access = await getMindfulInventoryAccess();

    if (!access) {
      return NextResponse.json(
        { error: "Mindful Inventory access denied." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const evaluationId = String(body.evaluationId || "").trim();

    if (!evaluationId) {
      return NextResponse.json(
        { error: "Evaluation id is required." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase.rpc(
      "purchase_evaluation_and_add_to_inventory",
      {
        evaluation_id: evaluationId,
        requested_company_id: access.company.companyId,
        requesting_user_id: access.userId,
      },
    );

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    const result = Array.isArray(data)
      ? (data[0] as ImportResult | undefined)
      : undefined;

    if (!result?.returned_inventory_vehicle_id) {
      return NextResponse.json(
        { error: "Inventory handoff returned no vehicle." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      evaluationId: result.returned_evaluation_id,
      inventoryVehicleId:
        result.returned_inventory_vehicle_id,
      status: result.returned_status,
      inventoryCreated: result.inventory_created,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to add vehicle to Inventory.",
      },
      { status: 500 },
    );
  }
}
