import type { SupabaseClient } from "@supabase/supabase-js";

import { getInventoryPerformerOptions, type InventoryPerformerOption } from "@/lib/mindful-inventory/performers";

export type InventoryDetailLevel = "presentation" | "retail" | "full" | "restoration" | "custom";
export type InventoryDetailStatus = "not_ready" | "needs_setup" | "awaiting_partner" | "scheduled" | "in_progress" | "completed" | "accepted";

export type InventoryDetailingView = {
  id: string | null;
  vehicleId: string;
  partnerId: string | null;
  partnerName: string | null;
  detailLevel: InventoryDetailLevel;
  scopeItems: string[];
  customScope: string | null;
  status: InventoryDetailStatus;
  proposedStartAt: string | null;
  scheduledStartAt: string | null;
  expectedTurnaroundMinutes: number | null;
  partnerConfirmationStatus: "awaiting_partner" | "confirmed" | "declined" | null;
  quotedCost: number | null;
  actualCost: number | null;
  notes: string | null;
  completedAt: string | null;
  acceptedAt: string | null;
};

export const DETAIL_SCOPE_OPTIONS = [
  "Exterior wash / decontamination",
  "Interior vacuum / wipe-down",
  "Interior extraction",
  "Leather cleaning / conditioning",
  "Paint correction",
  "Scratch / scuff touch-up",
  "Headlight restoration",
  "Odor treatment",
  "Engine bay cleaning",
  "Wheel / tire deep clean",
  "Ceramic coating",
] as const;

function nullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getInventoryDetailingData(
  supabase: SupabaseClient,
  companyId: string,
  vehicleId: string,
): Promise<{ detailing: InventoryDetailingView; performers: InventoryPerformerOption[] }> {
  const [detailResult, performers] = await Promise.all([
    supabase
      .from("mindful_inventory_detailing")
      .select("id,vehicle_id,partner_id,detail_level,scope_items,custom_scope,status,proposed_start_at,scheduled_start_at,expected_turnaround_minutes,partner_confirmation_status,quoted_cost,actual_cost,notes,completed_at,accepted_at")
      .eq("vehicle_id", vehicleId)
      .maybeSingle(),
    getInventoryPerformerOptions(supabase, companyId),
  ]);

  if (detailResult.error) throw new Error(detailResult.error.message);
  const row = detailResult.data;
  const partner = row?.partner_id ? performers.find((item) => item.type === "partner" && item.id === row.partner_id) || null : null;

  return {
    detailing: row
      ? {
          id: row.id,
          vehicleId: row.vehicle_id,
          partnerId: row.partner_id,
          partnerName: partner?.displayName || null,
          detailLevel: row.detail_level as InventoryDetailLevel,
          scopeItems: Array.isArray(row.scope_items) ? row.scope_items : [],
          customScope: row.custom_scope,
          status: row.status as InventoryDetailStatus,
          proposedStartAt: row.proposed_start_at,
          scheduledStartAt: row.scheduled_start_at,
          expectedTurnaroundMinutes: row.expected_turnaround_minutes,
          partnerConfirmationStatus: row.partner_confirmation_status,
          quotedCost: nullableNumber(row.quoted_cost),
          actualCost: nullableNumber(row.actual_cost),
          notes: row.notes,
          completedAt: row.completed_at,
          acceptedAt: row.accepted_at,
        }
      : {
          id: null,
          vehicleId,
          partnerId: null,
          partnerName: null,
          detailLevel: "retail",
          scopeItems: [],
          customScope: null,
          status: "needs_setup",
          proposedStartAt: null,
          scheduledStartAt: null,
          expectedTurnaroundMinutes: null,
          partnerConfirmationStatus: null,
          quotedCost: null,
          actualCost: null,
          notes: null,
          completedAt: null,
          acceptedAt: null,
        },
    performers,
  };
}
