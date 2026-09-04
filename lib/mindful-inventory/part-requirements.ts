import type { SupabaseClient } from "@supabase/supabase-js";

import { buildPartSearchSources } from "@/lib/mindful-inventory/part-suggestions";

export type PartRequirementStatus = "suggested" | "required" | "not_required";
export type PartFulfillmentMethod = "mindful_purchase" | "partner_supplied" | "in_stock" | "customer_supplied" | "not_required";
export type PartSourcingOwner = "owner" | "partner";

export type PartRequirementMessageView = {
  id: string;
  actorType: "owner" | "partner" | "system";
  actorLabel: string;
  messageType: "note" | "offer" | "counter" | "decision" | "source";
  body: string;
  unitPrice: number | null;
  sourceUrl: string | null;
  createdAt: string;
};

export type PartRequirementView = {
  id: string;
  vehicleId: string;
  planItemId: string | null;
  workOrderId: string | null;
  workTitle: string;
  findingId: string | null;
  upgradeId: string | null;
  linkedPartId: string | null;
  description: string;
  quantity: number;
  partNumber: string | null;
  origin: "ai" | "mechanic" | "owner" | "manager" | "work_order";
  requirementStatus: PartRequirementStatus;
  suggestedByPartnerId: string | null;
  suggestedByPartnerName: string | null;
  partnerOfferUnitPrice: number | null;
  partnerOfferNote: string | null;
  fitmentQuery: string | null;
  fulfillmentMethod: PartFulfillmentMethod | null;
  sourcingOwner: PartSourcingOwner | null;
  blocking: boolean;
  ownerTargetUnitPriceLow: number | null;
  ownerTargetUnitPriceHigh: number | null;
  ownerDecisionNote: string | null;
  executionStatus: string | null;
  supplier: string | null;
  sourceUrl: string | null;
  quotedUnitPrice: number | null;
  actualUnitPrice: number | null;
  etaAt: string | null;
  receivedAt: string | null;
  installedAt: string | null;
  messages: PartRequirementMessageView[];
  sources: ReturnType<typeof buildPartSearchSources>;
};

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getInventoryPartRequirements(
  supabase: SupabaseClient,
  companyId: string,
  vehicleId: string,
): Promise<PartRequirementView[]> {
  const { data: rows, error } = await supabase
    .from("mindful_inventory_part_requirements")
    .select("id,vehicle_id,plan_item_id,work_order_id,finding_id,upgrade_id,linked_part_id,description,quantity,part_number,origin,requirement_status,suggested_by_partner_id,partner_offer_unit_price,partner_offer_note,fitment_query,fulfillment_method,sourcing_owner,blocking,owner_target_unit_price_low,owner_target_unit_price_high,owner_decision_note,created_at")
    .eq("company_id", companyId)
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  if (!rows?.length) return [];

  const planItemIds = rows.map((row) => row.plan_item_id).filter(Boolean) as string[];
  const workOrderIds = rows.map((row) => row.work_order_id).filter(Boolean) as string[];
  const partnerIds = rows.map((row) => row.suggested_by_partner_id).filter(Boolean) as string[];
  const linkedPartIds = rows.map((row) => row.linked_part_id).filter(Boolean) as string[];
  const requirementIds = rows.map((row) => row.id);

  const [planResult, workResult, partnerResult, partResult, messageResult] = await Promise.all([
    planItemIds.length
      ? supabase.from("mindful_inventory_plan_items").select("id,title").in("id", planItemIds)
      : Promise.resolve({ data: [], error: null }),
    workOrderIds.length
      ? supabase.from("mindful_inventory_work_orders").select("id,title").in("id", workOrderIds)
      : Promise.resolve({ data: [], error: null }),
    partnerIds.length
      ? supabase.from("mindful_inventory_partners").select("id,name").in("id", partnerIds)
      : Promise.resolve({ data: [], error: null }),
    linkedPartIds.length
      ? supabase.from("mindful_inventory_work_order_parts").select("id,status,supplier,source_url,quoted_unit_price,actual_unit_price,eta_at,received_at,installed_at").in("id", linkedPartIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("mindful_inventory_part_requirement_messages").select("id,requirement_id,actor_type,actor_user_id,actor_partner_id,message_type,body,unit_price,source_url,created_at").in("requirement_id", requirementIds).order("created_at", { ascending: true }),
  ]);

  for (const result of [planResult, workResult, partnerResult, partResult, messageResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const planById = new Map((planResult.data || []).map((row) => [row.id, row.title]));
  const workById = new Map((workResult.data || []).map((row) => [row.id, row.title]));
  const partnerById = new Map((partnerResult.data || []).map((row) => [row.id, row.name]));
  const partById = new Map((partResult.data || []).map((row) => [row.id, row]));
  const messagesByRequirement = new Map<string, PartRequirementMessageView[]>();

  for (const message of messageResult.data || []) {
    const partnerName = message.actor_partner_id ? partnerById.get(message.actor_partner_id) || null : null;
    const actorLabel = message.actor_type === "partner" ? (partnerName || "Partner") : message.actor_type === "owner" ? "Owner" : "Lot Logic";
    const list = messagesByRequirement.get(message.requirement_id) || [];
    list.push({
      id: message.id,
      actorType: message.actor_type as PartRequirementMessageView["actorType"],
      actorLabel,
      messageType: message.message_type as PartRequirementMessageView["messageType"],
      body: message.body,
      unitPrice: numberOrNull(message.unit_price),
      sourceUrl: message.source_url,
      createdAt: message.created_at,
    });
    messagesByRequirement.set(message.requirement_id, list);
  }

  return rows.map((row) => {
    const part = row.linked_part_id ? partById.get(row.linked_part_id) || null : null;
    const query = row.fitment_query || row.description;
    return {
      id: row.id,
      vehicleId: row.vehicle_id,
      planItemId: row.plan_item_id,
      workOrderId: row.work_order_id,
      workTitle: row.work_order_id ? workById.get(row.work_order_id) || row.description : row.plan_item_id ? planById.get(row.plan_item_id) || row.description : row.description,
      findingId: row.finding_id,
      upgradeId: row.upgrade_id,
      linkedPartId: row.linked_part_id,
      description: row.description,
      quantity: Number(row.quantity || 1),
      partNumber: row.part_number,
      origin: row.origin as PartRequirementView["origin"],
      requirementStatus: row.requirement_status as PartRequirementStatus,
      suggestedByPartnerId: row.suggested_by_partner_id,
      suggestedByPartnerName: row.suggested_by_partner_id ? partnerById.get(row.suggested_by_partner_id) || null : null,
      partnerOfferUnitPrice: numberOrNull(row.partner_offer_unit_price),
      partnerOfferNote: row.partner_offer_note,
      fitmentQuery: row.fitment_query,
      fulfillmentMethod: row.fulfillment_method as PartFulfillmentMethod | null,
      sourcingOwner: row.sourcing_owner as PartSourcingOwner | null,
      blocking: Boolean(row.blocking),
      ownerTargetUnitPriceLow: numberOrNull(row.owner_target_unit_price_low),
      ownerTargetUnitPriceHigh: numberOrNull(row.owner_target_unit_price_high),
      ownerDecisionNote: row.owner_decision_note,
      executionStatus: part?.status || null,
      supplier: part?.supplier || null,
      sourceUrl: part?.source_url || null,
      quotedUnitPrice: numberOrNull(part?.quoted_unit_price),
      actualUnitPrice: numberOrNull(part?.actual_unit_price),
      etaAt: part?.eta_at || null,
      receivedAt: part?.received_at || null,
      installedAt: part?.installed_at || null,
      messages: messagesByRequirement.get(row.id) || [],
      sources: buildPartSearchSources(query),
    };
  });
}
