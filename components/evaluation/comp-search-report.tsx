"use client";

import { useState } from "react";
import {
  describeMarketCheckAttempt,
  type CompSearchRecommendation,
  type CompSearchReportEntry,
} from "@/lib/evaluation/comp-search-orchestration";

type SearchLogRow = {
  attemptName?: string;
  label?: string;
  market?: string;
  zip?: string;
  numFound?: number;
  listingCount?: number;
  usableComps?: number;
};

type FilterDiagnostics = {
  returnedListings?: number;
  usableListings?: number;
  rejectedListings?: number;
  rejectionCounts?: {
    fuelMismatch?: number;
    missingPriceOrMileage?: number;
    qualityBelowThreshold?: number;
    generationMismatch?: number;
    modelMismatch?: number;
    other?: number;
  };
};

function actionLabel(action: CompSearchRecommendation["action"]) {
  switch (action) {
    case "broaden-vehicle":
      return "Improve vehicle match";
    case "expand-geography":
      return "Nearby market expansion";
    case "national-discovery":
      return "National discovery";
    case "discovered-markets":
      return "Verify discovered markets";
    case "manual-review":
      return "Broader match review";
    default:
      return "Search complete";
  }
}

function actionButton(action: CompSearchRecommendation["action"]) {
  switch (action) {
    case "broaden-vehicle":
      return "Improve Vehicle Match →";
    case "expand-geography":
      return "Search Next Markets →";
    case "national-discovery":
      return "Search Nationwide →";
    case "discovered-markets":
      return "Verify Discovered Markets →";
    case "manual-review":
      return "Review Broader Match Options →";
    default:
      return "Continue →";
  }
}

export function CompSearchReport({
  vehicleLabel,
  regionsChecked,
  retrievalLabel,
  apiCallsMade,
  searchLog,
  filterDiagnostics,
  entries,
  nationalDiscoveryStatus,
  nationalDiscoveryTotal,
  recommendation,
  improving,
  activityStatus,
  errorCode,
  errorMessage,
  onImprove,
}: {
  vehicleLabel: string;
  regionsChecked: string[];
  retrievalLabel: string;
  apiCallsMade: number;
  searchLog: SearchLogRow[];
  filterDiagnostics: FilterDiagnostics | null;
  entries: CompSearchReportEntry[];
  nationalDiscoveryStatus: string;
  nationalDiscoveryTotal: number | null;
  recommendation: CompSearchRecommendation;
  improving: boolean;
  activityStatus?: string;
  errorCode?: string;
  errorMessage?: string;
  onImprove: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const candidateListings =
    filterDiagnostics?.returnedListings ??
    searchLog.reduce((sum, row) => sum + Number(row.listingCount || 0), 0);
  const usableListings =
    filterDiagnostics?.usableListings ??
    searchLog.reduce((sum, row) => sum + Number(row.usableComps || 0), 0);
  const rejectedListings = Math.max(
    Number(filterDiagnostics?.rejectedListings || 0),
    candidateListings - usableListings,
  );
  const rejectionCounts = filterDiagnostics?.rejectionCounts || {};

  const searchWasBlocked = Boolean(errorMessage);
  const headline = searchWasBlocked
    ? errorCode === "PER_EVALUATION_USAGE_LIMIT"
      ? "Search allowance reached"
      : "Market search couldn't run"
    : usableListings > 0
      ? "Market evidence found"
      : "No reliable comps yet";

  const summary = searchWasBlocked
    ? errorMessage || "The market search did not run."
    : usableListings > 0
      ? `${regionsChecked.length} market${regionsChecked.length === 1 ? "" : "s"} searched · ${candidateListings} listing${candidateListings === 1 ? "" : "s"} reviewed · ${usableListings} qualified`
      : candidateListings > 0
        ? `${regionsChecked.length} market${regionsChecked.length === 1 ? "" : "s"} searched · ${candidateListings} possible match${candidateListings === 1 ? "" : "es"} reviewed · 0 qualified`
        : `${regionsChecked.length} market${regionsChecked.length === 1 ? "" : "s"} searched · no reliable matches found yet`;

  const explanation = searchWasBlocked
    ? "No MarketCheck geography was searched in this attempt, so this is not a no-comps result."
    : usableListings > 0
      ? "Lot Logic found evidence that is strong enough to support the valuation."
      : Number(rejectionCounts.modelMismatch || 0) > 0
        ? "The matches we found were not close enough to the target vehicle to trust for valuation."
        : candidateListings > 0
          ? "Possible matches were found, but they did not meet Lot Logic's standards for valuation."
          : "The markets checked so far did not produce a reliable match.";

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.1em] text-blue-700">
              Market search
            </div>
            <h3 className="mt-1 text-lg font-black text-slate-950">{headline}</h3>
            <div className="mt-1 text-sm font-black text-slate-700">{summary}</div>
            <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-slate-500">
              {explanation}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="shrink-0 text-xs font-black text-slate-500 hover:text-blue-700"
          >
            View search details
          </button>
        </div>

        {!searchWasBlocked && recommendation.action !== "complete" ? (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.09em] text-blue-600">
              Next: {actionLabel(recommendation.action)}
            </div>
            <div className="mt-1 text-sm font-black text-slate-950">
              {recommendation.title}
            </div>
            <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-slate-600">
              {recommendation.reason}
            </p>

            {improving && activityStatus ? (
              <div className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-xs font-bold text-blue-800">
                {activityStatus}
              </div>
            ) : null}

            <button
              type="button"
              onClick={onImprove}
              disabled={improving}
              className="mt-3 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-800 disabled:cursor-wait disabled:bg-slate-300"
            >
              {improving ? "Searching…" : actionButton(recommendation.action)}
            </button>
          </div>
        ) : null}

        {nationalDiscoveryStatus ? (
          <div className="mt-3 text-xs font-semibold leading-5 text-violet-700">
            <span className="font-black">National discovery:</span>{" "}
            {nationalDiscoveryStatus}
          </div>
        ) : null}
      </div>

      {detailsOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
          onClick={() => setDetailsOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Comp search details"
            className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.1em] text-blue-700">
                  Search details
                </div>
                <h2 className="mt-1 text-xl font-black text-slate-950">
                  How Lot Logic searched
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Detailed search history and qualification checks for this vehicle.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  ["Markets searched", regionsChecked.length],
                  ["Candidate listings", candidateListings],
                  ["Qualified evidence", usableListings],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl bg-slate-50 px-3 py-3">
                    <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                      {label}
                    </div>
                    <div className="mt-1 text-lg font-black text-slate-900">{value}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
                  Vehicle checked
                </div>
                <div className="mt-1 text-sm font-black text-slate-900">{vehicleLabel}</div>
                <div className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                  Retrieval strategy: {retrievalLabel}. Returned listings still have to pass Lot Logic's year, mileage, body/configuration, drivetrain, and vehicle-match checks before influencing valuation.
                </div>
              </div>

              {regionsChecked.length ? (
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
                    Markets checked
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {regionsChecked.map((region) => (
                      <span
                        key={region}
                        className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600"
                      >
                        {region}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {nationalDiscoveryStatus ? (
                <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.08em] text-violet-600">
                    National discovery
                  </div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-violet-900">
                    {nationalDiscoveryStatus}
                    {typeof nationalDiscoveryTotal === "number"
                      ? ` · ${nationalDiscoveryTotal} active listing${nationalDiscoveryTotal === 1 ? "" : "s"} found`
                      : ""}
                  </div>
                </div>
              ) : null}

              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
                  Search history
                </div>
                <div className="mt-2 space-y-2">
                  {entries.length ? (
                    entries.map((entry) => (
                      <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-black text-slate-800">
                            {entry.source} · {entry.strategy}
                          </div>
                          <div className="text-[10px] font-bold text-slate-400">
                            {entry.apiCalls} provider call{entry.apiCalls === 1 ? "" : "s"}
                          </div>
                        </div>
                        <div className="mt-1 text-[11px] font-semibold leading-5 text-slate-600">
                          {entry.summary}
                        </div>
                        {entry.details.length ? (
                          <div className="mt-1 text-[10px] font-semibold leading-4 text-slate-400">
                            {entry.details.join(" · ")}
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : searchLog.length ? (
                    searchLog.map((row, index) => (
                      <div
                        key={`${row.attemptName || "search"}-${row.zip || index}`}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                      >
                        <div className="text-xs font-black text-slate-800">
                          {describeMarketCheckAttempt(row.attemptName || "")}
                        </div>
                        <div className="mt-1 text-[11px] font-semibold text-slate-500">
                          {row.label || row.market || row.zip || "Market"} · {Number(row.listingCount || 0)} listing{Number(row.listingCount || 0) === 1 ? "" : "s"} returned
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs font-semibold text-slate-500">
                      No detailed search history is available yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 px-4 py-3 text-[10px] font-semibold leading-4 text-slate-400">
                {rejectedListings > 0
                  ? `${rejectedListings} returned listing${rejectedListings === 1 ? "" : "s"} did not qualify in the latest pass. `
                  : ""}
                {apiCallsMade > 0
                  ? `The latest MarketCheck pass used ${apiCallsMade} provider call${apiCallsMade === 1 ? "" : "s"}. `
                  : ""}
                Provider-call limits control cost and rate limits; Lot Logic uses the results and remaining search paths to decide what to do next.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
