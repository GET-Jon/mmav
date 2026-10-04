"use client";

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
  onImprove: () => void;
}) {
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
  const rejectionSummary = [
    rejectionCounts.modelMismatch
      ? `${rejectionCounts.modelMismatch} vehicle/model mismatch${rejectionCounts.modelMismatch === 1 ? "" : "es"}`
      : null,
    rejectionCounts.generationMismatch
      ? `${rejectionCounts.generationMismatch} outside the target generation`
      : null,
    rejectionCounts.qualityBelowThreshold
      ? `${rejectionCounts.qualityBelowThreshold} below the quality threshold`
      : null,
    rejectionCounts.fuelMismatch
      ? `${rejectionCounts.fuelMismatch} fuel-type mismatch${rejectionCounts.fuelMismatch === 1 ? "" : "es"}`
      : null,
    rejectionCounts.missingPriceOrMileage
      ? `${rejectionCounts.missingPriceOrMileage} missing price or mileage`
      : null,
  ].filter(Boolean) as string[];

  const learned =
    candidateListings === 0
      ? "The searches completed, but the provider did not return candidate inventory in the markets checked."
      : usableListings === 0
        ? rejectionSummary.length
          ? `Inventory was returned, but none cleared Lot Logic's qualification checks: ${rejectionSummary.join("; ")}.`
          : "Inventory was returned, but none of it cleared Lot Logic's vehicle-equivalence and quality checks."
        : `Lot Logic found ${usableListings} usable candidate${usableListings === 1 ? "" : "s"} after reviewing ${candidateListings} returned listing${candidateListings === 1 ? "" : "s"}.`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.1em] text-blue-700">
            Search report
          </div>
          <h3 className="mt-1 text-base font-black text-slate-950">
            {usableListings > 0
              ? "How Lot Logic built the market evidence"
              : "What Lot Logic searched"}
          </h3>
          <p className="mt-1 max-w-2xl text-xs font-semibold leading-5 text-slate-500">
            {learned}
          </p>
        </div>

        {recommendation.action !== "complete" ? (
          <button
            type="button"
            onClick={onImprove}
            disabled={improving}
            className="shrink-0 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-black text-white hover:bg-blue-800 disabled:cursor-wait disabled:bg-slate-300"
          >
            {improving ? "Improving Search…" : "Let Lot Logic Improve Search →"}
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 px-3 py-3">
          <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
            Markets searched
          </div>
          <div className="mt-1 text-lg font-black text-slate-900">
            {regionsChecked.length}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-3">
          <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
            Candidate listings
          </div>
          <div className="mt-1 text-lg font-black text-slate-900">
            {candidateListings}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-3">
          <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
            Qualified evidence
          </div>
          <div className="mt-1 text-lg font-black text-slate-900">
            {usableListings}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
          What we checked
        </div>
        <div className="mt-1 text-sm font-black text-slate-900">{vehicleLabel}</div>
        <div className="mt-1 text-xs font-semibold leading-5 text-slate-500">
          Retrieval strategy: {retrievalLabel}. Lot Logic still applies year,
          mileage, body/configuration, drivetrain, and vehicle-equivalence checks
          before a listing can influence valuation.
        </div>
      </div>

      {regionsChecked.length ? (
        <div className="mt-4">
          <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
            Where Lot Logic looked
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

      <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.08em] text-blue-600">
          Recommended next step
        </div>
        <div className="mt-1 text-sm font-black text-blue-950">
          {recommendation.title}
        </div>
        <div className="mt-1 text-xs font-semibold leading-5 text-blue-900/80">
          {recommendation.reason}
        </div>
      </div>

      {nationalDiscoveryStatus ? (
        <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/50 px-4 py-3 text-xs font-semibold leading-5 text-violet-900">
          <span className="font-black">National discovery:</span>{" "}
          {nationalDiscoveryStatus}
          {typeof nationalDiscoveryTotal === "number"
            ? ` (${nationalDiscoveryTotal} active listing${nationalDiscoveryTotal === 1 ? "" : "s"} found)`
            : ""}
        </div>
      ) : null}

      <details className="mt-4 rounded-xl border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-xs font-black text-slate-600">
          Search details
        </summary>
        <div className="space-y-3 border-t border-slate-200 px-4 py-4">
          {entries.length ? (
            <div className="space-y-2">
              {entries.map((entry) => (
                <div key={entry.id} className="rounded-lg bg-slate-50 px-3 py-3">
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
              ))}
            </div>
          ) : searchLog.length ? (
            <div className="space-y-2">
              {searchLog.map((row, index) => (
                <div key={`${row.attemptName || "search"}-${row.zip || index}`} className="rounded-lg bg-slate-50 px-3 py-3">
                  <div className="text-xs font-black text-slate-800">
                    {describeMarketCheckAttempt(row.attemptName || "")}
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-slate-500">
                    {row.label || row.market || row.zip || "Market"} · {Number(row.listingCount || 0)} listing{Number(row.listingCount || 0) === 1 ? "" : "s"} returned
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs font-semibold text-slate-500">
              Detailed search history will appear after the next MarketCheck pass.
            </div>
          )}

          <div className="text-[10px] font-semibold leading-4 text-slate-400">
            Provider-call limits control cost and rate limits; they are not the
            conclusion of the evaluation. Lot Logic uses the search results,
            rejection reasons, and remaining search paths to decide what to do next.
            {rejectedListings > 0
              ? ` ${rejectedListings} returned listing${rejectedListings === 1 ? "" : "s"} did not qualify in the latest pass.`
              : ""}
            {apiCallsMade > 0
              ? ` The latest MarketCheck pass used ${apiCallsMade} provider call${apiCallsMade === 1 ? "" : "s"}.`
              : ""}
          </div>
        </div>
      </details>
    </div>
  );
}
