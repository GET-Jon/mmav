import { PartnerWorkList } from "@/components/partner/partner-work-list";
import { requirePartnerPortalAccess } from "@/lib/partner-portal/access";
import { getPartnerAssignedWork } from "@/lib/partner-portal/work";

export const dynamic = "force-dynamic";

export default async function PartnerWorkPage() {
  const access = await requirePartnerPortalAccess();
  const workItems = await getPartnerAssignedWork(access);

  const openCount = workItems.filter((work) => !["complete", "cancelled"].includes(work.status)).length;
  const estimateNeeded = workItems.filter((work) => !work.latestEstimate && !["complete", "cancelled"].includes(work.status)).length;

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-4 px-4 py-4 sm:px-5 lg:px-7">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Lot Logic Partner Portal</div>
            <div className="mt-0.5 text-lg font-black">My Work</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-black">{access.partner.name}</div>
            <div className="text-xs text-slate-400">{access.partner.companyName || access.userEmail || "Partner"}</div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-5 lg:px-7">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-[30px] font-black tracking-[-0.035em]">Assigned Work</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Review assigned scope, submit your independent estimate, and update work status when enabled by the dealer.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm"><div className="text-xl font-black">{openCount}</div><div className="text-[10px] font-black uppercase text-slate-400">Open</div></div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm"><div className="text-xl font-black">{estimateNeeded}</div><div className="text-[10px] font-black uppercase text-slate-400">Need Estimate</div></div>
          </div>
        </div>

        <PartnerWorkList workItems={workItems} permissions={access.permissions} />
      </div>
    </main>
  );
}
