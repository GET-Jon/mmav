import type { SupabaseClient } from "@supabase/supabase-js";

export type InventoryUpgradeStatus = "proposed" | "withdrawn";
export type InventoryUpgradeMechanicalValidationStatus =
  | "pending"
  | "feasible"
  | "feasible_with_changes"
  | "not_recommended"
  | "needs_info";

export type InventoryUpgradeMechanicalPartSuggestion = {
  description: string;
  quantity: number;
  partNumber: string | null;
  notes: string | null;
};

export type InventoryUpgradeView = {
  id: string;
  requestedByUserId: string | null;
  title: string;
  description: string | null;
  category: string;
  desiredOutcome: string | null;
  manufacturer: string | null;
  partNumber: string | null;
  quantity: number;
  preferredVendor: string | null;
  productUrl: string | null;
  substitutesAllowed: boolean;
  estimatedPartsCost: number | null;
  estimatedLaborCost: number | null;
  estimatedTotalCost: number | null;
  notes: string | null;
  status: InventoryUpgradeStatus;
  mechanicalValidationStatus: InventoryUpgradeMechanicalValidationStatus;
  mechanicalValidationNotes: string | null;
  mechanicalRecommendedAction: string | null;
  mechanicalPartSuggestions: InventoryUpgradeMechanicalPartSuggestion[];
  mechanicalCanPerform: boolean | null;
  mechanicalLaborHours: number | null;
  mechanicalProposedLaborPrice: number | null;
  createdAt: string;
  updatedAt: string;
};

export type InventoryInternalOwnerOption = {
  userId: string;
  displayName: string;
  email: string | null;
  role: string;
};

type InventoryOwnerRpcRow = {
  user_id: string;
  display_name: string;
  email: string | null;
  role: string;
};

export type InventoryOverviewIntakeData = {
  upgrades: InventoryUpgradeView[];
  ownerOptions: InventoryInternalOwnerOption[];
};

function toNumber(value: number | string | null | undefined, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePartSuggestions(value: unknown): InventoryUpgradeMechanicalPartSuggestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const description = String(row.description ?? row.name ?? "").trim();
    if (!description) return [];
    const quantity = Number(row.quantity ?? 1);
    return [{
      description,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      partNumber: String(row.partNumber ?? row.part_number ?? "").trim() || null,
      notes: String(row.notes || "").trim() || null,
    }];
  });
}

export async function getInventoryOverviewIntakeData(
  supabase: SupabaseClient,
  companyId: string,
  vehicleId: string,
): Promise<InventoryOverviewIntakeData> {
  const [upgradesResult, ownersResult] = await Promise.all([
    supabase
      .from("mindful_inventory_upgrades")
      .select(
        "id,requested_by_user_id,title,description,category,desired_outcome,manufacturer,part_number,quantity,preferred_vendor,product_url,substitutes_allowed,estimated_parts_cost,estimated_labor_cost,estimated_total_cost,notes,status,mechanical_validation_status,mechanical_validation_notes,mechanical_recommended_action,mechanical_part_suggestions,mechanical_can_perform,mechanical_labor_hours,mechanical_proposed_labor_price,created_at,updated_at",
      )
      .eq("company_id", companyId)
      .eq("vehicle_id", vehicleId)
      .order("created_at", { ascending: true }),
    supabase.rpc("get_inventory_company_members", {
      requested_company_id: companyId,
    }),
  ]);

  if (upgradesResult.error) throw new Error(upgradesResult.error.message);
  if (ownersResult.error) throw new Error(ownersResult.error.message);

  const upgrades: InventoryUpgradeView[] = (upgradesResult.data || []).map((row) => ({
    id: row.id,
    requestedByUserId: row.requested_by_user_id,
    title: row.title,
    description: row.description,
    category: row.category,
    desiredOutcome: row.desired_outcome,
    manufacturer: row.manufacturer,
    partNumber: row.part_number,
    quantity: toNumber(row.quantity, 1),
    preferredVendor: row.preferred_vendor,
    productUrl: row.product_url,
    substitutesAllowed: Boolean(row.substitutes_allowed),
    estimatedPartsCost: toNullableNumber(row.estimated_parts_cost),
    estimatedLaborCost: toNullableNumber(row.estimated_labor_cost),
    estimatedTotalCost: toNullableNumber(row.estimated_total_cost),
    notes: row.notes,
    status: row.status as InventoryUpgradeStatus,
    mechanicalValidationStatus: (row.mechanical_validation_status || "pending") as InventoryUpgradeMechanicalValidationStatus,
    mechanicalValidationNotes: row.mechanical_validation_notes,
    mechanicalRecommendedAction: row.mechanical_recommended_action,
    mechanicalPartSuggestions: normalizePartSuggestions(row.mechanical_part_suggestions),
    mechanicalCanPerform: typeof row.mechanical_can_perform === "boolean" ? row.mechanical_can_perform : null,
    mechanicalLaborHours: toNullableNumber(row.mechanical_labor_hours),
    mechanicalProposedLaborPrice: toNullableNumber(row.mechanical_proposed_labor_price),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  const ownerRows = (ownersResult.data || []) as InventoryOwnerRpcRow[];
  const ownerOptions: InventoryInternalOwnerOption[] = ownerRows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
  }));

  return { upgrades, ownerOptions };
}
