import Link from "next/link";
import { redirect } from "next/navigation";

import { PartnerDetailingList } from "@/components/partner/partner-detailing-list";
import { PartnerPartsConversationBoard } from "@/components/partner/partner-parts-conversation-board";
import { PartnerWorkGroupedV2 } from "@/components/partner/partner-work-grouped-v2";
import { requirePartnerPortalAccess } from "@/lib/partner-portal/access";
import { getPartnerDetailingAssignments } from "@/lib/partner-portal/detailing";
import { getPartnerInspectionAssignments } from "@/lib/partner-portal/inspections";
import { getPartnerAssignedWork } from "@/lib/partner-portal/work";

export const dynamic = "force-dynamic";

type LoadResult<T> = { data: T; error: string | null };

async function safeLoad<T>(label: string, load: () => Promise<T>, fallback: T): Promise<LoadResult<T>> {
  try {
    return { data: await load(), error: null };
  } catch (error) {
    console.error(`[partner/work] ${label} failed`, error);
    return { data: fallback, error: error instanceof Error ? `${label}: ${error.message}` : `${label} could not be loaded.` };
  }
}

export default async function PartnerWorkPage() {
  const access = await requirePartnerPortalAccess();
  if (!access.partner.profileConfirmedAt) redirect("/partner/profile?onboarding=1");

  const [workResult, detailingResult, inspectionResult] = await Promise.all([
    safeLoad("Assigned work", () => getPartnerAssignedWork(access), []),
    safeLoad("Detailing assignments", () => getPartnerDetailingAssignments(access), []),
    access.partner.mechanicalInspectionEligible
      ? safeLoad("Mechanical inspections", () => getPartnerInspectionAssignments(access), [])
      : Promise.resolve({ data: [], error: null }),
  ]);

  const workItems = workResult.data;
  const detailingItems = detailingResult.data;
  const inspectionItems = inspectionResult.data;
  const loadErrors = [workResult.error, detailingResult.error, inspectionResult.error].filter((value): value is string => Boolean(value));

  const openCount = workItems.filter((work) => !["complete", "cancelled"].includes(work.status)).length + detailingItems.length;
  const estimateNeeded = workItems.filter((work) =>
    !["complete", "cancelled"].includes(work.status) && access.permissions.editEstimate &&
    (!work.latestEstimate || ["awaiting_estimate", "revision_requested"].includes(work.partnerEstimateStatus || "awaiting_estimate")),
  ).length;
  const inspectionAttention = inspectionItems.filter((item) => ["assigned", "confirmed", "in_progress", "revision_requested"].includes(item.status)).length;
  const partConversationWorkIds = workItems.filter((work) => !["complete", "cancelled"].includes(work.status)).map((work) => work.id);

  return <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-4 px-4 py-4 sm:px-5 lg:px-7">
      <div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Lot Logic Partner Portal</div><div className="mt-0.5 text-lg font-black">My Work</div></div>
      <div className="flex items-center gap-4"><nav className="flex gap-2">{access.partner.mechanicalInspectionEligible ? <Link href="/partner/inspections" className="relative rounded-lg px-3 py-2 text-sm font-black text-slate-600">Inspections{inspectionAttention > 0 ? <span className="ml-1.5 rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-black text-white">{inspectionAttention}</span> : null}</Link> : null}<Link href="/partner/work" className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-black text-white">My Work</Link><Link href="/partner/profile" className="rounded-lg px-3 py-2 text-sm font-black text-slate-600">Profile</Link></nav><div className="text-right"><div className="text-sm font-black">{access.partner.name}</div><div className="text-xs text-slate-400">{access.partner.companyName || access.userEmail || "Partner"}</div></div></div>
    </div></header>
    <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-5 lg:px-7">
      {loadErrors.length ? <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900"><div className="font-black">Some partner data could not be loaded.</div><div className="mt-1 text-xs font-semibold">{loadErrors.join(" · ")}</div></div> : null}
      {inspectionAttention > 0 ? <Link href="/partner/inspections" className="mb-5 flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900"><span>{inspectionAttention} mechanical inspection{inspectionAttention === 1 ? " needs" : "s need"} your attention.</span><span>Open Inspections →</span></Link> : null}
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-[30px] font-black tracking-[-0.035em]">Assigned Work</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Work is grouped by vehicle. Open only the job you are working on, confirm setup, review parts, submit any required labor estimate, and begin once approved.</p></div><div className="flex gap-2"><div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm"><div className="text-xl font-black">{openCount}</div><div className="text-[10px] font-black uppercase text-slate-400">Open</div></div><div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm"><div className="text-xl font-black">{estimateNeeded}</div><div className="text-[10px] font-black uppercase text-slate-400">Need Estimate</div></div></div></div>
      <PartnerDetailingList items={detailingItems} />
      <PartnerWorkGroupedV2 workItems={workItems} permissions={access.permissions} />
      <PartnerPartsConversationBoard workOrderIds={partConversationWorkIds} />
    </div>
  </main>;
}
