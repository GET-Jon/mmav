import Link from "next/link";
import { redirect } from "next/navigation";

import { PartnerInspectionList } from "@/components/partner/partner-inspection-list";
import { requirePartnerPortalAccess } from "@/lib/partner-portal/access";
import { getPartnerInspectionAssignments } from "@/lib/partner-portal/inspections";

export const dynamic = "force-dynamic";

export default async function PartnerInspectionsPage() {
  const access = await requirePartnerPortalAccess();
  if (!access.partner.profileConfirmedAt) redirect("/partner/profile?onboarding=1");
  if (!access.partner.mechanicalInspectionEligible) redirect("/partner/work");

  const items = await getPartnerInspectionAssignments(access);
  const activeCount = items.filter((item) => !["complete", "submitted", "cancelled"].includes(item.status)).length;
  const awaitingOwner = items.filter((item) => item.status === "submitted").length;

  return <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-4 px-4 py-4 sm:px-5 lg:px-7">
        <div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Lot Logic Partner Portal</div><div className="mt-0.5 text-lg font-black">Inspections</div></div>
        <div className="flex items-center gap-4">
          <nav className="flex gap-2"><Link href="/partner/inspections" className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-black text-white">Inspections</Link><Link href="/partner/work" className="rounded-lg px-3 py-2 text-sm font-black text-slate-600">My Work</Link><Link href="/partner/profile" className="rounded-lg px-3 py-2 text-sm font-black text-slate-600">Profile</Link></nav>
          <div className="text-right"><div className="text-sm font-black">{access.partner.name}</div><div className="text-xs text-slate-400">{access.partner.companyName || access.userEmail || "Partner"}</div></div>
        </div>
      </div>
    </header>
    <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-5 lg:px-7">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-[30px] font-black tracking-[-0.035em]">Mechanical Inspections</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Validate Lot Logic observations, add anything you find, and submit the inspection to the vehicle Owner. Inspection findings do not automatically become assigned work.</p></div><div className="flex gap-2"><div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm"><div className="text-xl font-black">{activeCount}</div><div className="text-[10px] font-black uppercase text-slate-400">Active</div></div><div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm"><div className="text-xl font-black">{awaitingOwner}</div><div className="text-[10px] font-black uppercase text-slate-400">Owner Review</div></div></div></div>
      <PartnerInspectionList items={items} typicalDurationHours={access.partner.typicalInspectionDurationHours} />
    </div>
  </main>;
}
