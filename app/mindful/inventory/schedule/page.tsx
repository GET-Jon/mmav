import { notFound } from "next/navigation";

import { InventoryScheduleBoard } from "@/components/mindful-inventory/inventory-schedule-board";
import { AppTopNav } from "@/components/navigation/app-top-nav";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventorySchedulingOptions } from "@/lib/mindful-inventory/active-work";
import { getInventoryPerformerOptions } from "@/lib/mindful-inventory/performers";
import { getInventorySchedule } from "@/lib/mindful-inventory/schedule";

export const dynamic = "force-dynamic";

export default async function InventorySchedulePage() {
  const access = await getMindfulInventoryAccess();
  if (!access) notFound();

  const [work, performerOptions, schedulingOptions] = await Promise.all([
    getInventorySchedule(access.supabase, access.company.companyId),
    getInventoryPerformerOptions(access.supabase, access.company.companyId),
    getInventorySchedulingOptions(access.supabase, access.company.companyId),
  ]);

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <AppTopNav active="schedule" userEmail={access.userEmail} userRole={access.company.role} />
      <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-5 lg:px-7">
        <InventoryScheduleBoard
          work={work}
          performerOptions={performerOptions}
          locationOptions={schedulingOptions.locations}
          resourceOptions={schedulingOptions.resources}
        />
      </div>
    </main>
  );
}
