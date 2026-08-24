import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getInventoryActiveWork,
  type InventoryWorkOrderView,
} from "@/lib/mindful-inventory/active-work";

export type InventoryPartStatus =
  | "needed"
  | "ordered"
  | "backordered"
  | "received"
  | "cancelled";

export type InventoryTransportStatus =
  | "requested"
  | "booked"
  | "awaiting_pickup"
  | "in_transit"
  | "delayed"
  | "delivered"
  | "cancelled";

export type InventoryPartView = {
  id: string;
  workOrderId: string;
  description: string;
  quantity: number;
  supplier: string | null;
  supplierReference: string | null;
  quotedUnitPrice: number | null;
  actualUnitPrice: number | null;
  status: InventoryPartStatus;
  orderedAt: string | null;
  etaAt: string | null;
  receivedAt: string | null;
  notes: string | null;
};

export type InventoryLocationOption = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
};

export type InventoryPartnerOption = {
  id: string;
  name: string;
  companyName: string | null;
};

export type InventoryTransportationView = {
  id: string;
  vehicleId: string;
  originLocationId: string | null;
  destinationLocationId: string | null;
  transporterPartnerId: string | null;
  externalTransporterName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  status: InventoryTransportStatus;
  pickupScheduledAt: string | null;
  expectedDeliveryAt: string | null;
  actualPickupAt: string | null;
  actualDeliveryAt: string | null;
  trackingReference: string | null;
  quotedCost: number | null;
  actualCost: number | null;
  notes: string | null;
};

export type InventoryPartsTransportData = {
  workOrders: InventoryWorkOrderView[];
  parts: InventoryPartView[];
  transportation: InventoryTransportationView[];
  locations: InventoryLocationOption[];
  partners: InventoryPartnerOption[];
};

type InventoryPartRow = {
  id: string;
  work_order_id: string;
  description: string;
  quantity: number | string;
  supplier: string | null;
  supplier_reference: string | null;
  quoted_unit_price: number | string | null;
  actual_unit_price: number | string | null;
  status: string;
  ordered_at: string | null;
  eta_at: string | null;
  received_at: string | null;
  notes: string | null;
};

function nullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getInventoryPartsTransportData(
  supabase: SupabaseClient,
  companyId: string,
  vehicleId: string,
): Promise<InventoryPartsTransportData> {
  const workOrders = await getInventoryActiveWork(supabase, vehicleId);
  const workOrderIds = workOrders.map((work) => work.id);

  let partsRows: InventoryPartRow[] = [];

  if (workOrderIds.length > 0) {
    const { data, error } = await supabase
      .from("mindful_inventory_work_order_parts")
      .select(
        "id,work_order_id,description,quantity,supplier,supplier_reference,quoted_unit_price,actual_unit_price,status,ordered_at,eta_at,received_at,notes",
      )
      .in("work_order_id", workOrderIds)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    partsRows = data || [];
  }

  const [
    { data: transportRows, error: transportError },
    { data: locationRows, error: locationError },
    { data: partnerRows, error: partnerError },
  ] = await Promise.all([
    supabase
      .from("mindful_inventory_transportation")
      .select(
        "id,vehicle_id,origin_location_id,destination_location_id,transporter_partner_id,external_transporter_name,contact_name,contact_phone,status,pickup_scheduled_at,expected_delivery_at,actual_pickup_at,actual_delivery_at,tracking_reference,quoted_cost,actual_cost,notes",
      )
      .eq("vehicle_id", vehicleId)
      .order("created_at", { ascending: false }),

    supabase
      .from("mindful_inventory_locations")
      .select("id,name,city,state")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("name"),

    supabase
      .from("mindful_inventory_partners")
      .select("id,name,company_name")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("name"),
  ]);

  if (transportError) throw new Error(transportError.message);
  if (locationError) throw new Error(locationError.message);
  if (partnerError) throw new Error(partnerError.message);

  return {
    workOrders,
    parts: partsRows.map((row) => ({
      id: row.id,
      workOrderId: row.work_order_id,
      description: row.description,
      quantity: Number(row.quantity || 1),
      supplier: row.supplier,
      supplierReference: row.supplier_reference,
      quotedUnitPrice: nullableNumber(row.quoted_unit_price),
      actualUnitPrice: nullableNumber(row.actual_unit_price),
      status: row.status as InventoryPartStatus,
      orderedAt: row.ordered_at,
      etaAt: row.eta_at,
      receivedAt: row.received_at,
      notes: row.notes,
    })),
    transportation: (transportRows || []).map((row) => ({
      id: row.id,
      vehicleId: row.vehicle_id,
      originLocationId: row.origin_location_id,
      destinationLocationId: row.destination_location_id,
      transporterPartnerId: row.transporter_partner_id,
      externalTransporterName: row.external_transporter_name,
      contactName: row.contact_name,
      contactPhone: row.contact_phone,
      status: row.status as InventoryTransportStatus,
      pickupScheduledAt: row.pickup_scheduled_at,
      expectedDeliveryAt: row.expected_delivery_at,
      actualPickupAt: row.actual_pickup_at,
      actualDeliveryAt: row.actual_delivery_at,
      trackingReference: row.tracking_reference,
      quotedCost: nullableNumber(row.quoted_cost),
      actualCost: nullableNumber(row.actual_cost),
      notes: row.notes,
    })),
    locations: (locationRows || []).map((row) => ({
      id: row.id,
      name: row.name,
      city: row.city,
      state: row.state,
    })),
    partners: (partnerRows || []).map((row) => ({
      id: row.id,
      name: row.name,
      companyName: row.company_name,
    })),
  };
}
