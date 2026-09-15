import Link from "next/link";

import type { PartnerInspectionItem } from "@/lib/partner-portal/inspections";
import type { PartnerWorkItem } from "@/lib/partner-portal/work";

const TIME_ZONE = "America/New_York";

function dateKey(value: Date | string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}

function timeLabel(value: string | null) {
  if (!value) return "Time not set";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function dayLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    hourCycle: "h23",
  }).format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function sameWeekFuture(date: string, todayKey: string) {
  const targetKey = dateKey(date);
  if (targetKey <= todayKey) return false;
  const now = new Date();
  const localWeekday = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" }).format(now);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const end = new Date(now.getTime() + (6 - (map[localWeekday] ?? 0)) * 24 * 60 * 60 * 1000);
  return targetKey <= dateKey(end);
}

function workAttention(work: PartnerWorkItem) {
  if (!work.latestEstimate || ["awaiting_estimate", "revision_requested"].includes(work.partnerEstimateStatus || "awaiting_estimate")) return "Labor estimate needed";
  const pendingParts = work.parts.filter((part) => !["received", "installed", "cancelled"].includes(part.status));
  if (pendingParts.length) return `${pendingParts.length} part${pendingParts.length === 1 ? "" : "s"} still pending`;
  if (!work.locationName && !work.partnerLocationRequest) return "Work location needed";
  if (!work.scheduledStartAt) return "Schedule needed";
  return null;
}

export function PartnerTodayDashboard({
  partnerName,
  workItems,
  inspectionItems,
}: {
  partnerName: string;
  workItems: PartnerWorkItem[];
  inspectionItems: PartnerInspectionItem[];
}) {
  const todayKey = dateKey(new Date());
  const openWork = workItems.filter((work) => !["complete", "cancelled"].includes(work.status));
  const todayWork = openWork
    .filter((work) => work.scheduledStartAt && dateKey(work.scheduledStartAt) === todayKey)
    .sort((a, b) => new Date(a.scheduledStartAt || 0).getTime() - new Date(b.scheduledStartAt || 0).getTime());
  const activeInspections = inspectionItems.filter((item) => !["complete", "submitted", "cancelled"].includes(item.status));
  const todayInspections = activeInspections
    .filter((item) => {
      const when = item.scheduledStartAt || item.requestedStartAt;
      return Boolean(when && dateKey(when) === todayKey);
    })
    .sort((a, b) => new Date(a.scheduledStartAt || a.requestedStartAt || 0).getTime() - new Date(b.scheduledStartAt || b.requestedStartAt || 0).getTime());
  const restOfWeek = openWork.filter((work) => work.scheduledStartAt && sameWeekFuture(work.scheduledStartAt, todayKey));

  const countsByVehicle = new Map<string, number>();
  for (const work of [...todayWork, ...restOfWeek]) countsByVehicle.set(work.vehicleLabel, (countsByVehicle.get(work.vehicleLabel) || 0) + 1);
  const vehicleLeaders = [...countsByVehicle.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label);
  const primaryVehicle = vehicleLeaders[0] || null;
  const secondaryVehicle = vehicleLeaders[1] || null;

  const firstName = partnerName.trim().split(/\s+/)[0] || partnerName;
  const summaryPieces = [
    `Today you have ${todayInspections.length} inspection${todayInspections.length === 1 ? "" : "s"} and ${todayWork.length} work order${todayWork.length === 1 ? "" : "s"} on your schedule.`,
    restOfWeek.length ? `There ${restOfWeek.length === 1 ? "is" : "are"} ${restOfWeek.length} more work order${restOfWeek.length === 1 ? "" : "s"} planned for the rest of the week.` : "The rest of the week is clear right now.",
    primaryVehicle ? `Most of the scheduled work is on the ${primaryVehicle}${secondaryVehicle ? `, with additional work on the ${secondaryVehicle}` : ""}.` : null,
  ].filter(Boolean);

  const upNextWork = todayWork[0] || openWork.find((work) => work.scheduledStartAt) || openWork[0] || null;
  const nextInspection = todayInspections[0] || activeInspections[0] || null;
  const attentionItems = openWork.flatMap((work) => {
    const attention = workAttention(work);
    return attention ? [{ id: work.id, title: work.title, vehicle: work.vehicleLabel, attention }] : [];
  }).slice(0, 3);

  const schedule = [
    ...todayInspections.map((item) => ({
      id: `inspection-${item.id}`,
      kind: "Inspection",
      title: item.vehicleLabel,
      at: item.scheduledStartAt || item.requestedStartAt,
    })),
    ...openWork.filter((work) => work.scheduledStartAt).map((work) => ({
      id: `work-${work.id}`,
      kind: "Work",
      title: `${work.vehicleLabel} · ${work.title}`,
      at: work.scheduledStartAt,
    })),
  ].filter((item): item is { id: string; kind: string; title: string; at: string } => Boolean(item.at))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .slice(0, 5);

  return <div className="space-y-5">
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600">Today at Lot Logic</div>
      <h1 className="mt-2 text-[30px] font-black tracking-[-0.035em] sm:text-[36px]">{greeting()}, {firstName}.</h1>
      <p className="mt-3 max-w-4xl text-[15px] font-semibold leading-7 text-slate-600">{summaryPieces.join(" ")}</p>
      {(nextInspection || upNextWork) ? <div className="mt-5 rounded-2xl bg-slate-950 px-5 py-4 text-white">
        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">First up</div>
        {nextInspection ? <div className="mt-1 flex flex-wrap items-center justify-between gap-3"><div><div className="text-lg font-black">{nextInspection.vehicleLabel} inspection</div><div className="mt-0.5 text-sm font-semibold text-slate-300">{timeLabel(nextInspection.scheduledStartAt || nextInspection.requestedStartAt)}</div></div><Link href="/partner/inspections" className="rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-950">Open inspection →</Link></div> : upNextWork ? <div className="mt-1 flex flex-wrap items-center justify-between gap-3"><div><div className="text-lg font-black">{upNextWork.title}</div><div className="mt-0.5 text-sm font-semibold text-slate-300">{upNextWork.vehicleLabel} · {timeLabel(upNextWork.scheduledStartAt)}</div></div><Link href="/partner/work?view=all" className="rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-950">Open work →</Link></div> : null}
      </div> : null}
    </section>

    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Inspections</div><h2 className="mt-1 text-xl font-black">{todayInspections.length ? `${todayInspections.length} today` : "Clear today"}</h2></div><Link href="/partner/inspections" className="text-xs font-black text-blue-700">View inspections →</Link></div>
        {nextInspection ? <div className="mt-4 rounded-xl border border-slate-200 p-4"><div className="text-sm font-black">{nextInspection.vehicleLabel}</div><div className="mt-1 text-xs font-bold text-slate-500">{nextInspection.scheduledStartAt || nextInspection.requestedStartAt ? `${dayLabel(nextInspection.scheduledStartAt || nextInspection.requestedStartAt!)} · ${timeLabel(nextInspection.scheduledStartAt || nextInspection.requestedStartAt)}` : "Schedule not set"}</div></div> : <p className="mt-4 text-sm font-semibold text-slate-500">No inspections need your attention right now.</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Up next</div><h2 className="mt-1 text-xl font-black">{upNextWork ? upNextWork.title : "You're caught up"}</h2></div>{upNextWork ? <Link href="/partner/work?view=all" className="text-xs font-black text-blue-700">Open Work Order →</Link> : null}</div>
        {upNextWork ? <div className="mt-3"><div className="text-sm font-bold text-slate-600">{upNextWork.vehicleLabel}</div><div className="mt-1 text-xs font-bold text-slate-500">{upNextWork.scheduledStartAt ? `${dayLabel(upNextWork.scheduledStartAt)} · ${timeLabel(upNextWork.scheduledStartAt)}` : "Time not set"}{upNextWork.locationName ? ` · ${upNextWork.locationName}` : ""}</div>{workAttention(upNextWork) ? <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-black text-amber-900">Before you start: {workAttention(upNextWork)}</div> : <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-black text-emerald-800">Setup looks ready.</div>}</div> : <p className="mt-4 text-sm font-semibold text-slate-500">There is no open work assigned to you.</p>}
      </section>

      <section id="schedule" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
        <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Schedule</div><h2 className="mt-1 text-xl font-black">Today & next</h2></div><Link href="/partner/work?view=all" className="text-xs font-black text-blue-700">View all work →</Link></div>
        {schedule.length ? <div className="mt-4 divide-y divide-slate-100">{schedule.map((item) => <div key={item.id} className="grid gap-1 py-3 sm:grid-cols-[155px_90px_1fr] sm:items-center"><div className="text-xs font-black text-slate-500">{dayLabel(item.at)} · {timeLabel(item.at)}</div><div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">{item.kind}</div><div className="text-sm font-black text-slate-800">{item.title}</div></div>)}</div> : <p className="mt-4 text-sm font-semibold text-slate-500">Nothing scheduled yet.</p>}
      </section>
    </div>

    {attentionItems.length ? <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5"><div className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-700">Needs your attention</div><div className="mt-3 grid gap-2">{attentionItems.map((item) => <Link key={item.id} href="/partner/work?view=all" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-white px-4 py-3"><div><div className="text-sm font-black text-slate-900">{item.title}</div><div className="text-xs font-semibold text-slate-500">{item.vehicle}</div></div><div className="text-xs font-black text-amber-800">{item.attention} →</div></Link>)}</div></section> : null}
  </div>;
}
