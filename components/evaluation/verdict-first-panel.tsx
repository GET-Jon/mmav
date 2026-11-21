"use client";

import type { ReactNode } from "react";
import type { VerdictFirstAssessment } from "@/lib/evaluation/verdict-first";

function Money({ value }: { value: number }) {
  return <>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value)}</>;
}

function ConfidenceRow({ label, level, detail }: { label: string; level: string; detail: string }) {
  return (
    <div className="space-y-1 border-t border-slate-100 pt-2 first:border-0 first:pt-0">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-bold text-slate-800">{label}</span>
        <span className="font-semibold text-slate-600">{level}</span>
      </div>
      <p className="text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

/** The decision is always visible. Evidence and legacy audit screens are opt-in. */
export function VerdictFirstPanel({
  title, subtitle, askingPrice, marketPrice, marketLabel, marketCount, marketSource,
  assessment, onPrimaryAction, onSave, saveDisabled, saving, saved, onMarketEvidence,
  onEditVehicle, children,
}: {
  title: string;
  subtitle: string;
  askingPrice: number;
  marketPrice: number;
  marketLabel: string;
  marketCount: number;
  marketSource: string;
  assessment: VerdictFirstAssessment;
  onPrimaryAction: () => void;
  onSave: () => void;
  saveDisabled: boolean;
  saving: boolean;
  saved: boolean;
  onMarketEvidence: () => void;
  onEditVehicle: () => void;
  children?: ReactNode;
}) {
  const supported = marketSource === "supported";
  return (
    <section aria-label="Acquisition assessment" className="space-y-4">
      <article className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Lot Logic · Acquisition assessment</p>
          <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${
            assessment.verdict === "Pursue" ? "bg-emerald-100 text-emerald-800" :
            assessment.verdict === "Pass" ? "bg-red-100 text-red-800" :
            "bg-slate-100 text-slate-700"
          }`}>{assessment.verdict}</span>
        </div>
        <h1 className="mt-3 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">{title}</h1>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        <div className="mt-5 grid grid-cols-2 gap-3 border-y border-slate-100 py-5">
          <div>
            <p className="text-[10px] font-black uppercase leading-4 tracking-wide text-slate-500">{marketLabel}</p>
            <p className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              {marketPrice > 0 ? <Money value={marketPrice} /> : "Not established"}
            </p>
            <p className="mt-1 text-xs leading-4 text-slate-500">{marketPrice > 0
              ? `${marketCount} selected listing${marketCount === 1 ? "" : "s"} · ${supported ? "supported valuation" : "indicative asking market"}`
              : "No defensible asking-market indication yet"}</p>
          </div>
          <div className="border-l border-slate-100 pl-3 sm:pl-5">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Entered purchase price</p>
            <p className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              {askingPrice > 0 ? <Money value={askingPrice} /> : "Not entered"}
            </p>
            <p className="mt-1 text-xs text-slate-500">Before fees and repairs</p>
          </div>
        </div>

        <div className="pt-4">
          <h2 className="text-base font-black text-slate-950">{assessment.headline}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{assessment.summary}</p>
        </div>

        <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-800">Assessment confidence</span>
            <span className="text-sm font-black text-slate-800">{assessment.confidence}</span>
          </div>
          <details className="mt-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-semibold text-blue-700">Why this confidence level?</summary>
            <div className="mt-3 space-y-3">
              <ConfidenceRow label="Vehicle identity" level={assessment.identityConfidence}
                detail={assessment.blockers.includes("Retail trim is not verified") ? "The retail trim is not verified." :
                  assessment.blockers.includes("Conflicting vehicle identity information") ? "One or more vehicle attributes conflict." : "Vehicle identity has been established to the extent reported by the sources."} />
              <ConfidenceRow label="Market evidence" level={assessment.marketConfidence}
                detail={supported ? "A qualifying close-peer pricing cohort supports the estimate." :
                  marketCount > 0 ? "Related listings exist, but a reliable subject-specific resale estimate is not established." :
                    "No trusted comparison listings establish a market price."} />
              <ConfidenceRow label="Acquisition readiness" level={assessment.acquisitionConfidence}
                detail={assessment.acquisitionConfidence === "High" ? "Key acquisition assumptions are supported." :
                  "Important condition, pricing or purchase assumptions remain to be verified."} />
              {assessment.blockers.length ? (
                <div>
                  <p className="font-bold text-slate-700">Outstanding verification</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {assessment.blockers.map(item => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
          </details>
        </div>

        <div className="mt-5">
          <p className="text-sm font-black text-slate-950">Next: {assessment.actionLabel}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{assessment.actionExplanation}</p>
          <button type="button" onClick={onPrimaryAction}
            className="mt-3 w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-800">
            {assessment.actionLabel} →
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={onEditVehicle} className="text-xs font-bold text-blue-700 hover:underline">
            Edit vehicle
          </button>
          <button type="button" onClick={onSave} disabled={saveDisabled}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {saving ? "Saving…" : saved ? "Update Pipeline" : "Save to Pipeline"}
          </button>
        </div>
      </article>

      <details className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-black text-blue-700">View supporting evidence and full evaluation</summary>
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <button type="button" onClick={onMarketEvidence} className="text-xs font-bold text-blue-700 hover:underline">
            Review and improve market comparisons →
          </button>
          {children}
        </div>
      </details>
    </section>
  );
}
