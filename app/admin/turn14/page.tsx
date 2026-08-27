import { notFound } from "next/navigation";

import { Turn14Admin } from "@/components/admin/turn14-admin";
import { AppTopNav } from "@/components/navigation/app-top-nav";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { isTurn14Configured } from "@/lib/turn14/read-only";

export const dynamic = "force-dynamic";

export default async function Turn14AdminPage() {
  const access = await getMindfulInventoryAccess();
  if (!access || access.company.role !== "company_admin") notFound();

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <AppTopNav active="admin" userEmail={access.userEmail} userRole={access.company.role} />
      <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-5 lg:px-7">
        <div className="mb-6">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Administration</div>
          <h1 className="mt-1 text-[30px] font-black tracking-[-0.035em]">Turn 14 Distribution</h1>
          <p className="mt-2 max-w-3xl text-slate-600">Validate the dealer API connection before Lot Logic begins reading Turn 14 catalog data.</p>
        </div>
        <Turn14Admin configured={isTurn14Configured()} />
      </div>
    </main>
  );
}
