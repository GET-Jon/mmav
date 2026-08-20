import type { SupabaseClient } from "@supabase/supabase-js";

export type InventoryCarPlanStatus = "draft" | "approved" | "superseded";
export type InventoryPlanItemClassification =
  | "required"
  | "recommended"
  | "optional"
  | "upgrade"
  | "investigate";
export type InventoryPlanItemDecision =
  | "approved"
  | "declined"
  | "investigate"
  | "monitor";
export type InventoryPlanItemCostSource =
  | "known_quote"
  | "historical_actual"
  | "catalog_parts_cost"
  | "comparable_vehicle"
  | "ai_estimate"
  | "unknown";

export type InventoryCarPlanVersionSummary = {
  id: string;
  versionNumber: number;
  status: InventoryCarPlanStatus;
  parentVersionId: string | null;
  revisionReason: string | null;
  planningTotal: number;
  targetReadyAt: string | null;
  aiGenerated: boolean;
  aiSummary: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InventoryPlanItemView = {
  id: string;
  planVersionId: string;
  stableItemKey: string;
  primaryFindingId: string | null;
  findingIds: string[];
  title: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  classification: InventoryPlanItemClassification;
  decision: InventoryPlanItemDecision;
  priority: "1" | "2" | "3";
  rationale: string | null;
  estimatedCostLow: number | null;
  estimatedCostHigh: number | null;
  planningAmount: number;
  estimatedDurationHours: number | null;
  suggestedPartnerId: string | null;
  declineReason: string | null;
  sequenceOrder: number;
  confidence: number | null;
  assumptions: unknown[];
  managerInvestigationRequired: boolean;
  costSource: InventoryPlanItemCostSource;
  costSourceDetail: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InventoryCarPlanData = {
  carPlanId: string | null;
  currentApprovedVersionId: string | null;
  currentApprovedVersion: InventoryCarPlanVersionSummary | null;
  currentDraftVersion: InventoryCarPlanVersionSummary | null;
  versions: InventoryCarPlanVersionSummary[];
  draftItems: InventoryPlanItemView[];
};

function toNumber(value: number | string | null | undefined, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function versionFromRow(row: Record<string, unknown>): InventoryCarPlanVersionSummary {
  return {
    id: String(row.id),
    versionNumber: toNumber(row.version_number as number | string | null),
    status: row.status as InventoryCarPlanStatus,
    parentVersionId: (row.parent_version_id as string | null) ?? null,
    revisionReason: (row.revision_reason as string | null) ?? null,
    planningTotal: toNumber(row.planning_total as number | string | null),
    targetReadyAt: (row.target_ready_at as string | null) ?? null,
    aiGenerated: Boolean(row.ai_generated),
    aiSummary: (row.ai_summary as string | null) ?? null,
    approvedBy: (row.approved_by as string | null) ?? null,
    approvedAt: (row.approved_at as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function getInventoryCarPlanData(
  supabase: SupabaseClient,
  vehicleId: string,
): Promise<InventoryCarPlanData> {
  const { data: planRow, error: planError } = await supabase
    .from("mindful_inventory_car_plans")
    .select("id,current_approved_version_id")
    .eq("vehicle_id", vehicleId)
    .maybeSingle();

  if (planError) throw new Error(planError.message);

  if (!planRow) {
    return {
      carPlanId: null,
      currentApprovedVersionId: null,
      currentApprovedVersion: null,
      currentDraftVersion: null,
      versions: [],
      draftItems: [],
    };
  }

  const { data: versionRows, error: versionError } = await supabase
    .from("mindful_inventory_car_plan_versions")
    .select(
      "id,version_number,status,parent_version_id,revision_reason,planning_total,target_ready_at,ai_generated,ai_summary,approved_by,approved_at,created_at,updated_at",
    )
    .eq("car_plan_id", planRow.id)
    .order("version_number", { ascending: false });

  if (versionError) throw new Error(versionError.message);

  const versions = (versionRows || []).map((row) =>
    versionFromRow(row as Record<string, unknown>),
  );
  const currentDraftVersion = versions.find((version) => version.status === "draft") ?? null;
  const currentApprovedVersion =
    versions.find((version) => version.id === planRow.current_approved_version_id) ?? null;

  if (!currentDraftVersion) {
    return {
      carPlanId: planRow.id,
      currentApprovedVersionId: planRow.current_approved_version_id,
      currentApprovedVersion,
      currentDraftVersion: null,
      versions,
      draftItems: [],
    };
  }

  const { data: itemRows, error: itemsError } = await supabase
    .from("mindful_inventory_plan_items")
    .select(
      "id,plan_version_id,stable_item_key,finding_id,title,description,category,subcategory,classification,decision,priority,rationale,estimated_cost_low,estimated_cost_high,planning_amount,estimated_duration_hours,suggested_partner_id,decline_reason,sequence_order,confidence,assumptions,manager_investigation_required,cost_source,cost_source_detail,created_at,updated_at",
    )
    .eq("plan_version_id", currentDraftVersion.id)
    .order("sequence_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (itemsError) throw new Error(itemsError.message);

  let findingLinks: Array<{ plan_item_id: string; finding_id: string }> = [];
  if ((itemRows || []).length > 0) {
    const { data, error } = await supabase
      .from("mindful_inventory_plan_item_findings")
      .select("plan_item_id,finding_id")
      .in(
        "plan_item_id",
        (itemRows || []).map((row) => row.id),
      );

    if (error) throw new Error(error.message);
    findingLinks = data || [];
  }

  const linksByItem = new Map<string, string[]>();
  for (const link of findingLinks) {
    const list = linksByItem.get(link.plan_item_id) || [];
    list.push(link.finding_id);
    linksByItem.set(link.plan_item_id, list);
  }

  const draftItems: InventoryPlanItemView[] = (itemRows || []).map((row) => ({
    id: row.id,
    planVersionId: row.plan_version_id,
    stableItemKey: row.stable_item_key,
    primaryFindingId: row.finding_id,
    findingIds: linksByItem.get(row.id) || (row.finding_id ? [row.finding_id] : []),
    title: row.title,
    description: row.description,
    category: row.category,
    subcategory: row.subcategory,
    classification: row.classification as InventoryPlanItemClassification,
    decision: row.decision as InventoryPlanItemDecision,
    priority: row.priority as "1" | "2" | "3",
    rationale: row.rationale,
    estimatedCostLow: row.estimated_cost_low === null ? null : toNumber(row.estimated_cost_low),
    estimatedCostHigh: row.estimated_cost_high === null ? null : toNumber(row.estimated_cost_high),
    planningAmount: toNumber(row.planning_amount),
    estimatedDurationHours:
      row.estimated_duration_hours === null ? null : toNumber(row.estimated_duration_hours),
    suggestedPartnerId: row.suggested_partner_id,
    declineReason: row.decline_reason,
    sequenceOrder: row.sequence_order,
    confidence: row.confidence === null ? null : toNumber(row.confidence),
    assumptions: Array.isArray(row.assumptions) ? row.assumptions : [],
    managerInvestigationRequired: Boolean(row.manager_investigation_required),
    costSource: row.cost_source as InventoryPlanItemCostSource,
    costSourceDetail: row.cost_source_detail,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return {
    carPlanId: planRow.id,
    currentApprovedVersionId: planRow.current_approved_version_id,
    currentApprovedVersion,
    currentDraftVersion,
    versions,
    draftItems,
  };
}
