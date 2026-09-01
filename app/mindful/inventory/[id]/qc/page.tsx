import Link from "next/link";
import { notFound } from "next/navigation";

import { InventoryQc } from "@/components/mindful-inventory/inventory-qc";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventoryDashboardData } from "@/lib/mindful-inventory/queries";
import { getInventoryQcData } from "@/lib/mindful-inventory/qc";

export default async function InventoryQcPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await getMindfulInventoryAccess();

  if (!access) notFound();

  const { id } = await params;

  const dashboard = await getInventoryDashboardData(
    access.supabase,
    access.company.companyId,
  );

  const vehicle = dashboard.vehicles.find((item) => item.id === id);

  if (!vehicle) notFound();

  const { data: detailing, error: detailError } = await access.supabase
    .from("mindful_inventory_detailing")
    .select("status")
    .eq("vehicle_id", vehicle.id)
    .maybeSingle();
  if (detailError) throw new Error(detailError.message);

  if (detailing?.status !== "accepted") {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <div className="text-xs font-black uppercase tracking-[0.1em] text-amber-700">Detailing required</div>
        <h2 className="mt-1 text-2xl font-black text-slate-950">Final QC is waiting on Detailing</h2>
        <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600">
          Every vehicle must complete the dedicated Detailing stage and receive manager acceptance before Final QC begins.
        </p>
        <Link href={`/mindful/inventory/${vehicle.id}/detailing`} className="mt-4 inline-flex rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">
          Open Detailing →
        </Link>
      </section>
    );
  }

  const data = await getInventoryQcData(
    access.supabase,
    vehicle.id,
  );

  return (
    <InventoryQc
      vehicleId={vehicle.id}
      data={data}
    />
  );
}
