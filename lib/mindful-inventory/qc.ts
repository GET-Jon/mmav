import type { SupabaseClient } from "@supabase/supabase-js";

export type InventoryQcOutcome =
  | "pass"
  | "fail"
  | "manager_override";

export type InventoryQcItemResult =
  | "pass"
  | "fail"
  | "not_applicable";

export type InventoryQcItemView = {
  id: string;
  category: string;
  label: string;
  result: string | null;
  notes: string | null;
  sequenceOrder: number;
};

export type InventoryQcInspectionView = {
  id: string;
  outcome: InventoryQcOutcome | null;
  summary: string | null;
  overrideReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  items: InventoryQcItemView[];
};

export type InventoryQcData = {
  inspection: InventoryQcInspectionView | null;
};

export async function getInventoryQcData(
  supabase: SupabaseClient,
  vehicleId: string,
): Promise<InventoryQcData> {
  const { data: inspection, error } = await supabase
    .from("mindful_inventory_qc_inspections")
    .select(
      "id,outcome,summary,override_reason,started_at,completed_at,created_at",
    )
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!inspection) {
    return { inspection: null };
  }

  const { data: items, error: itemsError } = await supabase
    .from("mindful_inventory_qc_items")
    .select("id,category,label,result,notes,sequence_order")
    .eq("qc_inspection_id", inspection.id)
    .order("sequence_order", { ascending: true });

  if (itemsError) throw new Error(itemsError.message);

  return {
    inspection: {
      id: inspection.id,
      outcome: inspection.outcome as InventoryQcOutcome | null,
      summary: inspection.summary,
      overrideReason: inspection.override_reason,
      startedAt: inspection.started_at,
      completedAt: inspection.completed_at,
      items: (items || []).map((item) => ({
        id: item.id,
        category: item.category,
        label: item.label,
        result: item.result,
        notes: item.notes,
        sequenceOrder: item.sequence_order,
      })),
    },
  };
}
