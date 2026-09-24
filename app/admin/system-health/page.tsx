import Link from "next/link";
import { notFound } from "next/navigation";

import { AppTopNav } from "@/components/navigation/app-top-nav";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getSystemHealthSnapshot, type HealthState } from "@/lib/observability/health";

export const dynamic = "force-dynamic";

function badge(state: HealthState) {
  if (state === "healthy") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (state === "warning") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (state === "unavailable") return "bg-red-50 text-red-700 ring-red-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function dot(state: HealthState) {
  if (state === "healthy") return "bg-emerald-500";
  if (state === "warning") return "bg-amber-500";
  if (state === "unavailable") return "bg-red-500";
  return "bg-slate-400";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export default async function SystemHealthPage() {
  const access = await getMindfulInventoryAccess();
  if (!access || access.company.role !== "company_admin") notFound();

  const snapshot = await getSystemHealthSnapshot();
  const unhealthy = snapshot.checks.filter((item) => item.state === "unavailable").length;
  const warnings = snapshot.checks.filter((item) => item.state === "warning").length;
  const overall = unhealthy ? "Attention required" : warnings ? "Operational with warnings" : "Operational";

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <AppTopNav active="admin" userEmail={access.userEmail} userRole={access.company.role} />
      <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-5 lg:px-7">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Administration · Observability</div>
            <h1 className="mt-1 text-[30px] font-black tracking-[-0.035em]">System Health</h1>
            <p className="mt-2 max-w-3xl text-slate-600">
              Technical health, dependency readiness, and traceable application events for Lot Logic.
            </p>
          </div>
          <Link href="/admin" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50">
            ← Admin
          </Link>
        </div>

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Overall status</div>
              <div className="mt-1 text-2xl font-black">{overall}</div>
            </div>
            <div className="text-right text-xs font-semibold text-slate-400">
              Snapshot {formatDate(snapshot.generatedAt)}
              <div className="mt-1">Refresh the page for a fresh check</div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {snapshot.checks.map((check) => (
            <div key={check.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-black">
                  <span className={`h-2.5 w-2.5 rounded-full ${dot(check.state)}`} />
                  {check.label}
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ring-1 ${badge(check.state)}`}>
                  {check.state.replace("_", " ")}
                </span>
              </div>
              <div className="mt-4 text-sm leading-5 text-slate-600">{check.detail}</div>
            </div>
          ))}
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Evaluations · 24h", snapshot.metrics.evaluations24h],
            ["Evaluations · 7d", snapshot.metrics.evaluations7d],
            ["Errors · 24h", snapshot.metrics.errors24h],
            ["Warnings · 24h", snapshot.metrics.warnings24h],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">{label}</div>
              <div className="mt-2 text-3xl font-black">{value === null ? "—" : value}</div>
            </div>
          ))}
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">Recent Event Trace</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Request and workflow breadcrumbs. Trace IDs group multiple steps from the same operation.
                </p>
              </div>
              {!snapshot.metrics.telemetryReady ? (
                <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700 ring-1 ring-amber-200">
                  Database migration pending
                </span>
              ) : null}
            </div>
          </div>

          {snapshot.recentEvents.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Time</th>
                    <th className="px-5 py-3">Subsystem</th>
                    <th className="px-5 py-3">Event</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Duration</th>
                    <th className="px-5 py-3">Trace</th>
                    <th className="px-5 py-3">Context</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {snapshot.recentEvents.map((event) => (
                    <tr key={event.id} className="align-top">
                      <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-600">{formatDate(event.created_at)}</td>
                      <td className="px-5 py-4 font-black">{event.subsystem}</td>
                      <td className="px-5 py-4">
                        <div className="font-bold">{event.event_name}</div>
                        {event.message ? <div className="mt-1 max-w-md text-xs text-slate-500">{event.message}</div> : null}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ring-1 ${
                          event.status === "ok"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : event.status === "warning"
                              ? "bg-amber-50 text-amber-700 ring-amber-200"
                              : "bg-red-50 text-red-700 ring-red-200"
                        }`}>{event.status}</span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">{event.duration_ms == null ? "—" : `${event.duration_ms} ms`}</td>
                      <td className="max-w-[220px] truncate px-5 py-4 font-mono text-xs text-slate-500" title={event.trace_id}>{event.trace_id}</td>
                      <td className="px-5 py-4 text-xs text-slate-500">
                        {event.evaluation_id ? <div>Evaluation: {event.evaluation_id.slice(0, 8)}…</div> : null}
                        {event.vehicle_id ? <div>Vehicle: {event.vehicle_id.slice(0, 8)}…</div> : null}
                        {!event.evaluation_id && !event.vehicle_id ? "—" : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <div className="text-base font-black">No telemetry events yet</div>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
                The dashboard is ready. Once the observability migration is applied, instrumented Lot Logic actions will begin appearing here automatically.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
