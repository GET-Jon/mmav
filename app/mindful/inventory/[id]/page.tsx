import { notFound } from "next/navigation";

import { InventoryIntakeGuideV3 } from "@/components/mindful-inventory/inventory-intake-guide-v3";
import { InventoryOverviewIntake } from "@/components/mindful-inventory/inventory-overview-intake";
import type { InventoryIntakeInspectionData } from "@/lib/mindful-inventory/intake-inspection";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventoryIntakeInspectionData } from "@/lib/mindful-inventory/intake-inspection";
import { getInventoryOverviewIntakeData } from "@/lib/mindful-inventory/overview-intake";
import { getInventoryDashboardData } from "@/lib/mindful-inventory/queries";
import type { InventoryVehicleView } from "@/lib/mindful-inventory/types";

function inferKeyCount(vehicle: InventoryVehicleView) {
  const snapshot = vehicle.sourceSnapshot || {};
  const directKeys = [
    "keysCount",
    "keyCount",
    "numberOfKeys",
    "keys_count",
    "key_count",
    "number_of_keys",
  ];

  function walk(value: unknown, depth = 0): number | null {
    if (!value || depth > 5) return null;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = walk(item, depth + 1);
        if (found !== null) return found;
      }
      return null;
    }
    if (typeof value !== "object") return null;

    const record = value as Record<string, unknown>;
    for (const key of directKeys) {
      const candidate = record[key];
      if (typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 0 && candidate <= 10) return candidate;
      if (typeof candidate === "string") {
        const parsed = Number(candidate.trim());
        if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 10) return parsed;
      }
    }

    for (const nested of Object.values(record)) {
      const found = walk(nested, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }

  const structured = walk(snapshot);
  if (structured !== null) return structured;

  const text = JSON.stringify(snapshot);
  const match = text.match(/\b([0-9])\s+(?:key|keys|key fob|key fobs)\b/i);
  return match ? Number(match[1]) : null;
}

function withSuggestedKeys(
  data: InventoryIntakeInspectionData,
  vehicle: InventoryVehicleView,
): InventoryIntakeInspectionData {
  if (data.intake?.keysCount !== null && data.intake?.keysCount !== undefined) return data;

  const inferredKeys = inferKeyCount(vehicle);
  if (inferredKeys === null) return data;

  if (data.intake) {
    return {
      ...data,
      intake: { ...data.intake, keysCount: inferredKeys },
    };
  }

  return {
    ...data,
    intake: {
      id: "",
      status: "draft",
      mileage: vehicle.mileage,
      keysCount: inferredKeys,
      visibleDamageSummary: null,
      initialObservations: null,
      preliminaryGrade: null,
      fieldConfirmations: {},
      startedAt: null,
      completedAt: null,
    },
  };
}

export default async function MindfulInventoryVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getMindfulInventoryAccess();
  if (!access) notFound();

  const { id } = await params;
  const data = await getInventoryDashboardData(access.supabase, access.company.companyId);
  const vehicle = data.vehicles.find((item) => item.id === id);
  if (!vehicle) notFound();

  const [overview, rawIntakeData] = await Promise.all([
    getInventoryOverviewIntakeData(access.supabase, access.company.companyId, vehicle.id),
    getInventoryIntakeInspectionData(access.supabase, vehicle.id),
  ]);

  const intakeData = withSuggestedKeys(rawIntakeData, vehicle);

  return (
    <>
      <InventoryOverviewIntake vehicle={vehicle} overview={overview} intakeData={intakeData} />
      <InventoryIntakeGuideV3
        vehicleId={vehicle.id}
        initialConfirmations={rawIntakeData.intake?.fieldConfirmations || {}}
      />
    </>
  );
}
