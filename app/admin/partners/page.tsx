import Link from "next/link";
import { notFound } from "next/navigation";

import { PartnerAdmin } from "@/components/admin/partner-admin";
import { AppTopNav } from "@/components/navigation/app-top-nav";
import { getAdminPartnerData } from "@/lib/admin/partners";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

export const dynamic = "force-dynamic";

export default async function AdminPartnersPage() {
  const access = await getMindfulInventoryAccess();
  if (!access || access.company.role !== "company_admin") notFound();

  const data = await getAdminPartnerData(access.supabase, access.company.companyId);

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <AppTopNav active="admin" userEmail={access.userEmail} userRole={access.company.role} />
      <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-5 lg:px-7">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/admin" className="text-xs font-black text-slate-500 hover:text-slate-950">← Administration</Link>
            <div className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Administration / Partners</div>
            <h1 className="mt-1 text-[30px] font-black tracking-[-0.035em]">Partner Management</h1>
            <p className="mt-2 max-w-3xl text-slate-600">Create and maintain the specialists Lot Logic can assign, schedule, and eventually give limited partner access.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-sm">{data.partners.filter((partner) => partner.active).length} active partners</div>
        </div>
        <PartnerAdmin partners={data.partners} capabilities={data.capabilities} locations={data.locations} />
      </div>
    </main>
  );
}
