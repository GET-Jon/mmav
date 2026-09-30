"use client";

import { useEffect, useState } from "react";

type EvidencePayload = {
  counts: { predictions: number; outcomes: number; decisions: number };
  predictions: Array<{ id: string; prediction_type: string; subject_key: string; confidence: number | null; created_at: string }>;
  outcomes: Array<{ id: string; prediction_snapshot_id: string; actual_cost: number | null; actual_labor_minutes: number | null; actual_elapsed_minutes: number | null; qc_passed: boolean | null; resolved_at: string }>;
  decisions: Array<{ id: string; decision_type: string; decided_at: string }>;
};

function label(value: string) {
  return value.replaceAll("_", " ");
}

function when(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function LotLogicEvidenceCard() {
  const [data, setData] = useState<EvidencePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/intelligence/evidence", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Evidence could not be loaded.");
        if (active) setData(payload);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Evidence could not be loaded.");
      });
    return () => { active = false; };
  }, []);

  const total = data ? data.counts.predictions + data.counts.outcomes + data.counts.decisions : 0;

  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Evidence / Predictions</div>
          <h2 className="mt-1 text-xl font-black tracking-[-0.02em]">What Lot Logic is observing</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            This is the evidence layer beneath formal learned insights. It lets you see predictions, resolved outcomes, and recorded decisions accumulating before Lot Logic has enough repeated evidence to call something learned.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 px-4 py-3"><div className="text-xl font-black">{data?.counts.predictions ?? "—"}</div><div className="text-[10px] font-black uppercase text-slate-400">Predictions</div></div>
          <div className="rounded-xl bg-slate-50 px-4 py-3"><div className="text-xl font-black">{data?.counts.outcomes ?? "—"}</div><div className="text-[10px] font-black uppercase text-slate-400">Outcomes</div></div>
          <div className="rounded-xl bg-slate-50 px-4 py-3"><div className="text-xl font-black">{data?.counts.decisions ?? "—"}</div><div className="text-[10px] font-black uppercase text-slate-400">Decisions</div></div>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      {!error && data && total === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
          Clean slate. No prediction evidence has been recorded yet. New Evaluator and Inventory activity will begin filling this area immediately.
        </div>
      ) : null}

      {data && total > 0 ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Recent predictions</div>
            <div className="mt-2 space-y-2">
              {data.predictions.slice(0, 8).map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="text-sm font-black capitalize">{label(item.prediction_type)}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-600">{label(item.subject_key)}</div>
                  <div className="mt-2 text-[11px] font-bold text-slate-400">{item.confidence == null ? "Confidence not scored" : `${Math.round(item.confidence * 100)}% confidence`} · {when(item.created_at)}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Recent outcomes</div>
            <div className="mt-2 space-y-2">
              {data.outcomes.slice(0, 8).map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="text-sm font-black">Prediction resolved</div>
                  <div className="mt-1 text-xs font-semibold text-slate-600">
                    {item.actual_cost != null ? `$${Number(item.actual_cost).toLocaleString()} actual` : "Actual cost pending"}
                    {item.actual_labor_minutes != null ? ` · ${Math.round(item.actual_labor_minutes / 60 * 10) / 10} labor hr` : ""}
                  </div>
                  <div className="mt-2 text-[11px] font-bold text-slate-400">{when(item.resolved_at)}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Recent decisions</div>
            <div className="mt-2 space-y-2">
              {data.decisions.slice(0, 8).map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="text-sm font-black capitalize">{label(item.decision_type)}</div>
                  <div className="mt-2 text-[11px] font-bold text-slate-400">{when(item.decided_at)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
