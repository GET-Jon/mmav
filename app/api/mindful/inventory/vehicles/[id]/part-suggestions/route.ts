import { NextResponse } from "next/server";

import { normalizePartSearchesWithAi } from "@/lib/ai/part-search";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

export const runtime = "nodejs";

export async function POST(
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
    const { data: vehicle } = await access.supabase
      .from("mindful_inventory_vehicles")
      .select("id")
      .eq("id", vehicleId)
      .eq("company_id", access.company.companyId)
      .maybeSingle();

    if (!vehicle) {
      return NextResponse.json({ error: "Inventory vehicle not found." }, { status: 404 });
    }

    const body = (await request.json()) as { items?: unknown };
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const items = body.items.slice(0, 20).flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const row = raw as Record<string, unknown>;
      const workOrderId = String(row.workOrderId || "").trim();
      const workOrderTitle = String(row.workOrderTitle || "").trim().slice(0, 300);
      const partName = String(row.partName || "").trim().slice(0, 200);
      const fitmentLabel = String(row.fitmentLabel || "").trim().slice(0, 500);
      if (!workOrderId || !workOrderTitle || !partName || !fitmentLabel) return [];
      return [{ workOrderId, workOrderTitle, partName, fitmentLabel }];
    });

    if (!items.length) return NextResponse.json({ items: [] });

    const workOrderIds = items.map((item) => item.workOrderId);
    const { data: validWorkOrders, error: workError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .select("id")
      .eq("vehicle_id", vehicleId)
      .in("id", workOrderIds);
    if (workError) throw new Error(workError.message);

    const validIds = new Set((validWorkOrders || []).map((row) => row.id));
    const safeItems = items.filter((item) => validIds.has(item.workOrderId));
    if (!safeItems.length) return NextResponse.json({ items: [] });

    const normalized = await normalizePartSearchesWithAi(safeItems);
    return NextResponse.json({ items: normalized });
  } catch (error) {
    console.error("Part search normalization failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to improve part searches." },
      { status: 500 },
    );
  }
}
