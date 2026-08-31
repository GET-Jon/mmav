import Link from "next/link";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { InventoryActiveWork } from "@/components/mindful-inventory/inventory-active-work";
import { PartnerEstimateReviewPanel, type PartnerEstimateReviewItem } from "@/components/mindful-inventory/partner-estimate-review-panel";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventorySchedulingOptions, type InventoryWorkOrderView } from "@/lib/mindful-inventory/active-work";
import { buildPartSearchSuggestion } from "@/lib/mindful-inventory/part-suggestions";
import { getInventoryPartsTransportData } from "@/lib/mindful-inventory/parts-transport";
import { getInventoryPerformerOptions } from "@/lib/mindful-inventory/performers";
import { getInventoryDashboardData } from "@/lib/mindful-inventory/queries";

function lateLabel(work: InventoryWorkOrderView, nowMs: number) {
  if (!work.scheduledStartAt || ["complete", "cancelled"].includes(work.status)) return null;
  const durationMinutes = Math.max(1, work.estimatedElapsedMinutes ?? work.estimatedDurationMinutes ?? 60);
  if (work.status === "in_progress" && work.actualStartAt) {
    const actualStartMs = new Date(work.actualStartAt).getTime();
    if (!Number.isFinite(actualStartMs)) return null;
    const expectedFinishMs = actualStartMs + durationMinutes * 60_000;
    const bufferMinutes = Math.max(30, Math.round(durationMinutes * 0.15));
    const lateMinutes = Math.floor((nowMs - expectedFinishMs) / 60_000);
    if (lateMinutes <= bufferMinutes) return null;
    return lateMinutes >= 60 ? `${Math.round((lateMinutes / 60) * 10) / 10} hr past expected finish` : `${lateMinutes} min past expected finish`;
  }
  if (work.status !== "in_progress" && !work.actualStartAt) {
    const startMs = new Date(work.scheduledStartAt).getTime();
    if (!Number.isFinite(startMs)) return null;
    const lateMinutes = Math.floor((nowMs - startMs) / 60_000);
    if (lateMinutes <= 30) return null;
    return lateMinutes >= 60 ? `${Math.round((lateMinutes / 60) * 10) / 10} hr late to start` : `${lateMinutes} min late to start`;
  }
  return null;
}

function shortDateTime(value: string | null) {
  if (!value) return "unspecified";
  return new Date(value).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function updateTime(value: string) {
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

type PartnerScheduleChange = {
  workOrderId: string;
  workTitle: string;
  partnerName: string;
  requestedStartAt: string | null;
  partnerScheduledStartAt: string | null;
  automaticallyAccepted: boolean;
  changedAt: string;
};

async function getPartnerScheduleChanges(supabase: SupabaseClient, vehicleId: string): Promise<PartnerScheduleChange[]> {
  const { data: events, error } = await supabase
    .from("mindful_inventory_history")
    .select("entity_id,metadata,created_at")
    .eq("vehicle_id", vehicleId)
    .eq("entity_type", "work_order")
    .eq("event_type", "partner_schedule_changed")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  if (!events?.length) return [];
  const workOrderIds = [...new Set(events.map((event) => event.entity_id).filter(Boolean))] as string[];
  const { data: workOrders, error: workError } = await supabase.from("mindful_inventory_work_orders").select("id,title").in("id", workOrderIds);
  if (workError) throw new Error(workError.message);
  const titles = new Map((workOrders ?? []).map((work) => [work.id, work.title]));
  return events.flatMap((event) => {
    if (!event.entity_id) return [];
    const metadata = (event.metadata && typeof event.metadata === "object" ? event.metadata : {}) as Record<string, unknown>;
    return [{
      workOrderId: event.entity_id,
      workTitle: titles.get(event.entity_id) || "Work Order",
      partnerName: String(metadata.partnerName || "Partner"),
      requestedStartAt: metadata.requestedStartAt ? String(metadata.requestedStartAt) : null,
      partnerScheduledStartAt: metadata.partnerScheduledStartAt ? String(metadata.partnerScheduledStartAt) : null,
      automaticallyAccepted: metadata.automaticallyAccepted === true,
      changedAt: event.created_at,
    } satisfies PartnerScheduleChange];
  });
}

async function getPartnerEstimateReviews(supabase: SupabaseClient, vehicleId: string): Promise<PartnerEstimateReviewItem[]> {
  const { data: reviewWork, error: workError } = await supabase
    .from("mindful_inventory_work_orders")
    .select("id,title,assigned_partner_id")
    .eq("vehicle_id", vehicleId)
    .eq("partner_estimate_status", "awaiting_review")
    .not("assigned_partner_id", "is", null);
  if (workError) throw new Error(workError.message);
  if (!reviewWork?.length) return [];
  const workIds = reviewWork.map((row) => row.id);
  const partnerIds = [...new Set(reviewWork.map((row) => row.assigned_partner_id).filter(Boolean))] as string[];
  const [estimatesResult, partnersResult] = await Promise.all([
    supabase.from("lot_logic_partner_blind_estimates").select("id,work_order_id,partner_id,revision_no,quoted_cost,estimated_labor_minutes,estimated_elapsed_minutes,notes,submitted_at").in("work_order_id", workIds).order("revision_no", { ascending: false }),
    supabase.from("mindful_inventory_partners").select("id,name,company_name").in("id", partnerIds),
  ]);
  if (estimatesResult.error) throw new Error(estimatesResult.error.message);
  if (partnersResult.error) throw new Error(partnersResult.error.message);
  const latestByWork = new Map<string, NonNullable<typeof estimatesResult.data>[number]>();
  for (const estimate of estimatesResult.data ?? []) if (!latestByWork.has(estimate.work_order_id)) latestByWork.set(estimate.work_order_id, estimate);
  const partnerNames = new Map((partnersResult.data ?? []).map((partner) => [partner.id, partner.company_name ? `${partner.name} · ${partner.company_name}` : partner.name]));
  return reviewWork.flatMap((work) => {
    const estimate = latestByWork.get(work.id);
    if (!estimate || !work.assigned_partner_id) return [];
    return [{ workOrderId: work.id, title: work.title, partnerName: partnerNames.get(work.assigned_partner_id) || "Partner", estimateId: estimate.id, revisionNo: estimate.revision_no, quotedCost: estimate.quoted_cost == null ? null : Number(estimate.quoted_cost), estimatedLaborMinutes: estimate.estimated_labor_minutes, estimatedElapsedMinutes: estimate.estimated_elapsed_minutes, notes: estimate.notes, submittedAt: estimate.submitted_at } satisfies PartnerEstimateReviewItem];
  });
}

export default async function InventoryWorkPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getMindfulInventoryAccess();
  if (!access) notFound();
  const { id } = await params;
  const dashboard = await getInventoryDashboardData(access.supabase, access.company.companyId);
  const vehicle = dashboard.vehicles.find((item) => item.id === id);
  if (!vehicle) notFound();

  const [partsData, performerOptions, schedulingOptions, partnerEstimateReviews, partnerScheduleChanges] = await Promise.all([
    getInventoryPartsTransportData(access.supabase, access.company.companyId, vehicle.id),
    getInventoryPerformerOptions(access.supabase, access.company.companyId),
    getInventorySchedulingOptions(access.supabase, access.company.companyId),
    getPartnerEstimateReviews(access.supabase, vehicle.id),
    getPartnerScheduleChanges(access.supabase, vehicle.id),
  ]);
  const workOrders = partsData.workOrders;
  const partSuggestions = workOrders.filter((work) => !["complete", "cancelled"].includes(work.status)).map((work) => buildPartSearchSuggestion(vehicle, work));

  const nowMs = Date.now();
  const behindSchedule = workOrders.map((work) => ({ work, label: lateLabel(work, nowMs) })).filter((item): item is { work: InventoryWorkOrderView; label: string } => Boolean(item.label));
  const latestPartnerChange = partnerScheduleChanges[0] || null;

  return <div className="space-y-4">
    <PartnerEstimateReviewPanel items={partnerEstimateReviews} />

    <section className={`rounded-2xl border px-4 py-3 ${latestPartnerChange ? "border-blue-200 bg-blue-50" : "border-emerald-200 bg-emerald-50"}`}>
      <div className={`text-[10px] font-black uppercase tracking-[0.1em] ${latestPartnerChange ? "text-blue-700" : "text-emerald-700"}`}>Partner updates</div>
      {latestPartnerChange ? <>
        <div className="mt-1 text-xs text-slate-700"><span className="font-black">{latestPartnerChange.partnerName}</span> changed <span className="font-black">{latestPartnerChange.workTitle}</span> · Mindful suggested {shortDateTime(latestPartnerChange.requestedStartAt)} → partner scheduled {shortDateTime(latestPartnerChange.partnerScheduledStartAt)}{latestPartnerChange.automaticallyAccepted ? <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-black uppercase text-blue-700">Auto-accepted</span> : null}</div>
        {partnerScheduleChanges.length > 1 ? <details className="mt-2 rounded-xl border border-blue-200 bg-white/70 px-3 py-2">
          <summary className="cursor-pointer text-[11px] font-black text-blue-800">View update history ({partnerScheduleChanges.length})</summary>
          <div className="mt-2 space-y-2 border-t border-blue-100 pt-2">{partnerScheduleChanges.map((change, index) => <div key={`${change.workOrderId}:${change.changedAt}:${index}`} className="text-xs text-slate-700"><div><span className="font-black">{change.partnerName}</span> · <span className="font-black">{change.workTitle}</span> <span className="text-slate-400">· {updateTime(change.changedAt)}</span></div><div className="mt-0.5 text-slate-600">Mindful suggested {shortDateTime(change.requestedStartAt)} → partner scheduled {shortDateTime(change.partnerScheduledStartAt)}{change.automaticallyAccepted ? " · Auto-accepted" : ""}</div></div>)}</div>
        </details> : null}
      </> : <div className="mt-1 text-xs font-bold text-emerald-800">All going to plan · No partner schedule changes have been reported.</div>}
    </section>

    {behindSchedule.length ? <section className="rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-red-700">Behind schedule</div><div className="mt-0.5 text-sm font-black">{behindSchedule.length} Work Order{behindSchedule.length === 1 ? " is" : "s are"} behind schedule.</div><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-red-800">{behindSchedule.map(({ work, label }) => <span key={work.id}><span className="font-black">{work.title}</span> · {label}</span>)}</div></div><Link href="/mindful/inventory/schedule" className="shrink-0 rounded-xl bg-red-700 px-4 py-2 text-xs font-black text-white">Open Schedule →</Link></div></section> : null}

    <InventoryActiveWork
      vehicleId={vehicle.id}
      vehicle={{ year: vehicle.year, make: vehicle.make, model: vehicle.model, trim: vehicle.trim, vin: vehicle.vin, stockNumber: vehicle.stockNumber }}
      workOrders={workOrders}
      performerOptions={performerOptions}
      locationOptions={schedulingOptions.locations}
      resourceOptions={schedulingOptions.resources}
      parts={partsData.parts}
      partSuggestions={partSuggestions}
    />
  </div>;
}
