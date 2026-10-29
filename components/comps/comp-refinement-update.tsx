"use client";
import type { RefinementEvent } from "@/lib/comps-refinement-history";

function money(value: number | null) {
  return value === null ? "Not available" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function CompRefinementUpdate({ events, searching }: { events: RefinementEvent[]; searching: boolean }) {
  const latest = events[0];
  if (!latest && !searching) return null;
  const tone = latest?.status === "improved" ? "text-emerald-700" :
    latest?.status === "partial" ? "text-amber-700" : "text-slate-600";
  const headline = latest?.action === "selection" ? "Comparison selection updated" :
    latest?.status === "improved" ? "Pricing evidence improved" :
    latest?.status === "partial" && latest.newRelated > 0 ? "More comparisons found" :
    latest?.status === "partial" ? "Additional search completed" :
    latest?.status === "failed" ? "Search could not finish" :
    "No additional useful comparisons";
  return (
    <section aria-live="polite" className="mb-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      {searching ? <div role="status" className="text-sm font-bold text-blue-700">⌕ Checking additional comparisons…</div> : null}
      {latest ? <>
        <div className="flex flex-wrap items-center gap-2">
          <span aria-hidden="true" className={`text-lg ${tone}`}>{latest.status === "improved" ? "✓" : latest.status === "failed" ? "!" : "○"}</span>
          <span className="flex-1 text-sm font-extrabold text-slate-900">{headline}</span>
          <span className={`text-xs font-bold ${tone}`}>{latest.status === "improved" ? "Improved" : latest.status === "partial" ? "More context" : latest.status === "failed" ? "Incomplete" : "Unchanged"}</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div><span aria-hidden="true">⌖ </span><strong className="text-base">+{latest.newRegions.length}</strong><div className="text-slate-500">Regions</div></div>
          <div><span aria-hidden="true">▣ </span><strong className="text-base">+{latest.newRelated}</strong><div className="text-slate-500">Related comps</div></div>
          <div><span aria-hidden="true">◎ </span><strong className="text-base">{latest.primaryDelta > 0 ? "+" : ""}{latest.primaryDelta}</strong><div className="text-slate-500">Close pricing peers</div></div>
        </div>
        <p className="mt-2 text-xs text-slate-600">
          {latest.error || (latest.beforeConfidence !== latest.afterConfidence
            ? `Pricing confidence: ${latest.beforeConfidence} → ${latest.afterConfidence}.`
            : latest.status === "improved" ? "The price is supported by stronger comparable evidence." :
              latest.status === "partial" ? (latest.newRelated > 0 ? "More related listings found; pricing confidence did not improve." : "The search or selection changed, but no new related listings improved pricing confidence.") :
              "The existing pricing evidence remains unchanged.")}
        </p>
        <details className="mt-2 border-t border-slate-100 pt-2">
          <summary className="cursor-pointer text-xs font-bold text-blue-700">Details &amp; history ({events.length})</summary>
          <div className="mt-3 space-y-3">
            {events.map(event => <div key={event.id} className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
              <div className="flex flex-wrap justify-between gap-2 font-bold">
                <span>{event.action === "selection" ? "Manual comp review" : "Search refinement"} · {event.status}</span>
                <time dateTime={event.at} className="font-normal text-slate-500">{new Date(event.at).toLocaleString()}</time>
              </div>
              <p className="mt-1">{event.newRegions.length ? event.newRegions.join(", ") : "No new regions"} · {event.newUnique} unique listings · {event.newRelated} related · {event.primaryDelta > 0 ? "+" : ""}{event.primaryDelta} pricing peers</p>
              <p className="mt-1">Selected comps {event.beforeSelected} → {event.afterSelected} · Retail {money(event.beforeRetail)} → {money(event.afterRetail)} · Confidence {event.beforeConfidence} → {event.afterConfidence}</p>
              {event.error ? <p className="mt-1 text-amber-700">{event.error}</p> : null}
            </div>)}
          </div>
        </details>
      </> : null}
    </section>
  );
}
