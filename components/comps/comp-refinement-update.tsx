"use client";
import type { RefinementEvent } from "@/lib/comps-refinement-history";

function Money({ value }: { value: number | null }) {
  return <>{value === null ? "Unavailable" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value)}</>;
}

function RefinementIcon({ kind, className = "" }: { kind: "search" | "map" | "car" | "target" | "check" | "info"; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" className={className} {...common}>
    {kind === "search" ? <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></> : null}
    {kind === "map" ? <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></> : null}
    {kind === "car" ? <><path d="m5 11 2-5h10l2 5M4 16v3m16-3v3M4 11h16v6H4z"/><path d="M7 14h2m6 0h2"/></> : null}
    {kind === "target" ? <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></> : null}
    {kind === "check" ? <><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></> : null}
    {kind === "info" ? <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></> : null}
  </svg>;
}

export function CompRefinementUpdate({
  events, searching, nextStep,
}: {
  events: RefinementEvent[];
  searching: boolean;
  nextStep: "search" | "review";
}) {
  const latest = events[0];
  if (!latest && !searching) return null;
  const failed = latest?.status === "failed";
  const improved = latest?.status === "improved";
  const headline = latest?.action === "selection" ? "Comparison selection updated" :
    failed ? "Search was incomplete" :
    improved ? "Pricing evidence strengthened" :
    latest?.newRelated ? "Additional comparisons found" : "Search complete · no closer matches";
  const nextAction = failed ? "Retry the search or review the current comparisons." :
    improved ? "Review the updated estimate or continue to Verdict." :
    nextStep === "search" ? "For better pricing evidence, try another market or focus on closer mileage matches." :
    "Review the available listings or continue to Verdict with the provisional estimate.";

  return <div aria-live="polite" className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 sm:px-4">
    {searching ? <div role="status" className="flex items-center gap-2 text-xs font-semibold text-blue-700"><RefinementIcon kind="search"/> Checking additional comparisons…</div> : null}
    {latest ? <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <RefinementIcon kind={improved ? "check" : failed ? "info" : "search"} className={improved ? "text-emerald-700" : failed ? "text-amber-700" : "text-slate-500"}/>
          <span className="text-xs font-extrabold text-slate-800">{headline}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-700">
          {latest.action === "search" ? <span className="inline-flex items-center gap-1"><RefinementIcon kind="map" className="text-slate-400"/> +{latest.newRegions.length} markets</span> : null}
          <span className="inline-flex items-center gap-1"><RefinementIcon kind="car" className="text-slate-400"/> +{latest.newRelated} related</span>
          <span className="inline-flex items-center gap-1"><RefinementIcon kind="target" className={latest.primaryDelta > 0 ? "text-emerald-700" : "text-slate-400"}/>{latest.primaryDelta > 0 ? "+" : ""}{latest.primaryDelta} close pricing peers</span>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-xs text-slate-600">{latest.error || nextAction}</p>
        <details className="group text-xs">
          <summary className="cursor-pointer font-bold text-blue-700 hover:text-blue-900">Search details &amp; history ({events.length})</summary>
          <div className="mt-2 w-full space-y-2 border-t border-slate-200 pt-2">
            {events.map(event => <div key={event.id} className="rounded-md bg-white p-2 text-xs text-slate-700">
              <div className="flex flex-wrap justify-between gap-2 font-bold"><span>{event.action === "selection" ? "Manual comp review" : "Search refinement"} · {event.status}</span><time dateTime={event.at} className="font-normal text-slate-500">{new Date(event.at).toLocaleString()}</time></div>
              <p className="mt-1">{event.newRegions.length ? event.newRegions.join(", ") : "No new markets"} · {event.newUnique} new unique listings · {event.newRelated} related · {event.primaryDelta > 0 ? "+" : ""}{event.primaryDelta} pricing peers</p>
              <p className="mt-1">Selected {event.beforeSelected} → {event.afterSelected} · Retail <Money value={event.beforeRetail}/> → <Money value={event.afterRetail}/> · Confidence {event.beforeConfidence} → {event.afterConfidence}</p>
              {event.error ? <p className="mt-1 text-amber-700">{event.error}</p> : null}
            </div>)}
          </div>
        </details>
      </div>
    </> : null}
  </div>;
}
