"use client";

import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  calculateAdjustedCompPrice,
  calculateMileageAdjustment,
} from "@/lib/comps";
import type { Assumptions } from "@/types/assumptions";
import type { MarketComp } from "@/types/comps";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join("; ");
  return String(value);
}

function DetailItem({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <dt className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-bold text-slate-800">
        {displayValue(value)}
      </dd>
    </div>
  );
}

function fitLabel(score: number) {
  if (score >= 85) return "Excellent match";
  if (score >= 70) return "Good match";
  if (score >= 60) return "Usable match";
  return "Weak match";
}

function inferredListingConfidence(
  comp: MarketComp,
): "Low" | "Medium" | "High" {
  if (comp.marketCheckDetails?.listingConfidence) {
    return comp.marketCheckDetails.listingConfidence;
  }

  const details = comp.marketCheckDetails;
  const usefulFields = [
    details?.vin,
    comp.trim,
    details?.drivetrain,
    details?.fuelType,
    details?.engine,
    details?.listingUrl,
    details?.dealerName,
    details?.city,
    details?.state,
    details?.listingDate,
  ];
  const present = usefulFields.filter(
    (value) =>
      value !== null &&
      value !== undefined &&
      String(value).trim() !== "",
  ).length;

  if (present >= 8) return "High";
  if (present >= 5) return "Medium";
  return "Low";
}

function tierLabel(comp: MarketComp) {
  const tier = comp.equivalenceTier || "supporting";
  if (tier === "direct") return "Direct";
  if (tier === "near") return "Near";
  if (tier === "reject") return "Reject";
  return "Supporting";
}

function tierTone(comp: MarketComp) {
  const tier = comp.equivalenceTier || "supporting";
  if (tier === "direct") return "bg-emerald-100 text-emerald-800";
  if (tier === "near") return "bg-blue-100 text-blue-800";
  if (tier === "supporting") return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}

function tableRelationshipLabel(comp: MarketComp) {
  if (
    comp.equivalenceTier === "supporting" &&
    String(comp.candidateClassification || "").toLowerCase().includes("unknown")
  ) {
    return "Powertrain unverified";
  }

  return tierLabel(comp);
}

function scoreImpactRows(comp: MarketComp) {
  const factors = comp.marketCheckDetails?.compFitFactors;
  if (!factors) return [];

  const rows: Array<{ label: string; detail: string; points: number }> = [];

  const yearPenalty = Number(factors.yearPenalty || 0);
  if (yearPenalty > 0) {
    rows.push({
      label: "Model year",
      detail: factors.yearPreference || "Model year differs from the subject.",
      points: yearPenalty,
    });
  }

  const equivalenceModifier = Number(factors.equivalenceModifier || 0);
  if (equivalenceModifier < 0 && comp.equivalenceTier !== "reject") {
    rows.push({
      label: "Vehicle configuration",
      detail: (comp.equivalenceReasons || ["Configuration is not a direct match."]).join("; "),
      points: Math.abs(equivalenceModifier),
    });
  }

  const mileagePenalty = Number(factors.mileagePenalty || 0);
  if (mileagePenalty > 0) {
    rows.push({
      label: "Mileage difference",
      detail:
        factors.mileageDelta === null || factors.mileageDelta === undefined
          ? "Mileage evidence is incomplete."
          : `${formatNumber(factors.mileageDelta)} mi from the subject.`,
      points: mileagePenalty,
    });
  }

  const distancePenalty = Number(factors.distancePenalty || 0);
  if (distancePenalty > 0) {
    rows.push({
      label: "Market distance",
      detail: `${formatNumber(Number(factors.distanceMiles || comp.distance || 0))} mi from the target market.`,
      points: distancePenalty,
    });
  }

  const missingPricePenalty = Number(factors.missingPricePenalty || 0);
  if (missingPricePenalty > 0) {
    rows.push({
      label: "Price data",
      detail: "The source listing did not provide a usable asking price.",
      points: missingPricePenalty,
    });
  }

  return rows;
}

function CompFitExplanation({
  comp,
  targetMileage,
  assumptions,
}: {
  comp: MarketComp;
  targetMileage: number;
  assumptions: Assumptions;
}) {
  const factors = comp.marketCheckDetails?.compFitFactors;
  const targetYear = comp.marketCheckDetails?.targetYear;
  const mileageDelta = factors?.mileageDelta;
  const confidence = inferredListingConfidence(comp);
  const rejected = comp.equivalenceTier === "reject";
  const mileage = calculateMileageAdjustment({
    comp,
    targetMileage,
    assumptions,
  });

  return (
    <section className="mb-6 rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">
            Why this comp ranks here
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-950">
              {rejected ? "Rejected" : comp.qualityScore}
            </span>
            <span className="text-sm font-black text-slate-500">
              {rejected ? "from valuation" : "/ 100 Match Score"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-black ${tierTone(comp)}`}>
              {tierLabel(comp)}
            </span>
            <span className="text-sm font-bold text-blue-900">
              {rejected ? "Vehicle identity rule failed" : fitLabel(comp.qualityScore)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-blue-100 bg-white px-4 py-3">
          <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
            Listing confidence
          </div>
          <div className="mt-1 text-sm font-black text-slate-900">
            {confidence}
          </div>
          <div className="mt-1 max-w-52 text-xs font-medium text-slate-500">
            Data completeness is separate from vehicle equivalence.
          </div>
        </div>
      </div>

      {rejected ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="text-[10px] font-black uppercase tracking-[0.1em] text-red-700">
            Why Lot Logic rejected it
          </div>
          <div className="mt-1 text-sm font-bold leading-6 text-red-900">
            {(comp.equivalenceReasons || ["A hard vehicle-identity rule failed."]).join("; ")}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-amber-700">
                What lowered this score
              </div>
              <div className="mt-0.5 text-xs font-semibold text-amber-900">
                Match Score starts at 100. Only the deductions below reduce it.
              </div>
            </div>
            <div className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-700">
              Final {comp.qualityScore}/100
            </div>
          </div>

          {scoreImpactRows(comp).length ? (
            <div className="mt-3 divide-y divide-amber-200/70 rounded-xl border border-amber-200 bg-white/80">
              {scoreImpactRows(comp).map((item) => (
                <div
                  key={item.label}
                  className="flex items-start justify-between gap-4 px-3 py-2.5"
                >
                  <div>
                    <div className="text-xs font-black text-slate-900">
                      {item.label}
                    </div>
                    <div className="mt-0.5 text-[11px] font-semibold leading-4 text-slate-500">
                      {item.detail}
                    </div>
                  </div>
                  <div className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">
                    -{item.points} pts
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-xs font-bold text-emerald-800">
              No material match deductions were identified.
            </div>
          )}

          {Number(factors?.variantPenalty || 0) > 0 &&
          (comp.equivalenceTier === "direct" ||
            comp.equivalenceTier === "near") ? (
            <div className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-[11px] font-semibold leading-4 text-blue-800">
              Provider trim naming initially looked different, but Lot Logic&apos;s
              semantic identity check resolved the vehicles as equivalent. That
              provider-text penalty is not counted in the final score.
            </div>
          ) : null}
        </div>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white px-3 py-3">
          <div className="text-[9px] font-black uppercase text-slate-400">
            Equivalence
          </div>
          <div className="mt-1 text-sm font-black text-slate-900">
            {tierLabel(comp)}
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-500">
            {(comp.equivalenceReasons || ["Vehicle identity aligned"]).join("; ")}
          </div>
        </div>

        <div className="rounded-xl bg-white px-3 py-3">
          <div className="text-[9px] font-black uppercase text-slate-400">
            Model year
          </div>
          <div className="mt-1 text-sm font-black text-slate-900">
            {factors?.yearPreference ||
              (targetYear ? `${comp.year} vs ${targetYear}` : comp.year)}
          </div>
          {targetYear ? (
            <div className="mt-1 text-xs font-semibold text-slate-500">
              Target: {targetYear}
            </div>
          ) : null}
        </div>

        <div className="rounded-xl bg-white px-3 py-3">
          <div className="text-[9px] font-black uppercase text-slate-400">
            Mileage normalization
          </div>
          <div className="mt-1 text-sm font-black text-slate-900">
            {mileage.appliedAdjustment >= 0 ? "+" : ""}
            {formatMoney(mileage.appliedAdjustment)}
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-500">
            {mileageDelta === null || mileageDelta === undefined
              ? `${formatNumber(Math.abs(comp.mileage - targetMileage))} mi difference`
              : `${formatNumber(mileageDelta)} mi difference`}
            {mileage.capped ? " • capped" : ""}
            {mileage.reliability !== "normal"
              ? ` • ${mileage.reliability} confidence`
              : ""}
          </div>
        </div>

        <div className="rounded-xl bg-white px-3 py-3">
          <div className="text-[9px] font-black uppercase text-slate-400">
            Market distance
          </div>
          <div className="mt-1 text-sm font-black text-slate-900">
            {formatNumber(comp.distance)} mi
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-500">
            Target mileage: {formatNumber(targetMileage)} mi
          </div>
        </div>
      </div>

      {comp.needsClassificationReview ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
          Classification is incomplete. Lot Logic keeps this as Supporting evidence rather than auto-including it.
        </div>
      ) : null}
    </section>
  );
}

export function MarketCompsTable({
  comps,
  targetMileage,
  assumptions,
  onToggleIncluded,
  maxVisibleRows,
}: {
  comps: MarketComp[];
  targetMileage: number;
  assumptions: Assumptions;
  onToggleIncluded: (id: string) => void;
  maxVisibleRows?: number;
}) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "qualityScore", desc: true },
  ]);
  const [selectedComp, setSelectedComp] = useState<MarketComp | null>(null);

  const columns = useMemo<ColumnDef<MarketComp>[]>(
    () => [
      {
        accessorKey: "included",
        header: "",
        cell: ({ row }) => {
          const rejected = row.original.equivalenceTier === "reject";
          return (
            <input
              type="checkbox"
              checked={row.original.included}
              title={
                rejected
                  ? "Lot Logic rejected this match automatically. You can still include it as a dealer override; valuation confidence will be reduced."
                  : row.original.equivalenceTier === "supporting"
                    ? "Include this Supporting comp as a dealer selection."
                    : "Include this comp in valuation."
              }
              onClick={(event) => event.stopPropagation()}
              onChange={() => onToggleIncluded(row.original.id)}
              aria-label={`Include ${row.original.year} ${row.original.model}`}
              className="h-4 w-4 rounded border-slate-300 accent-blue-700"
            />
          );
        },
        enableSorting: false,
      },
      {
        id: "vehicle",
        header: "Vehicle",
        accessorFn: (row) => [row.year, row.model].filter(Boolean).join(" "),
        cell: ({ row }) => (
          <div className="min-w-[180px]">
            <div className="font-bold text-slate-950">
              {[row.original.year, row.original.model].filter(Boolean).join(" ")}
            </div>
            {row.original.marketCheckDetails?.compFitFactors?.yearPreference ? (
              <div
                className={`mt-0.5 text-[10px] font-black ${(row.original.marketCheckDetails.compFitFactors.yearDelta ?? 99) <= 2 ? "text-emerald-700" : "text-amber-700"}`}
              >
                {row.original.marketCheckDetails.compFitFactors.yearPreference}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "trim",
        header: "Trim",
        cell: ({ row }) => (
          <div className="min-w-[120px] max-w-[190px]">
            <span className="block truncate font-semibold text-slate-700">
              {row.original.trim || "Unavailable"}
            </span>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-black ${tierTone(row.original)}`}
              >
                {tableRelationshipLabel(row.original)}
              </span>
              {row.original.dealerDecision === "include" ? (
                <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-black text-blue-800">
                  Dealer selected
                </span>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        id: "source",
        header: "Source",
        accessorFn: (row) => row.source,
        cell: ({ row }) => (
          <div className="min-w-[120px]">
            <div className="font-semibold text-slate-900">{row.original.source}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {row.original.region || "Region unavailable"}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "askingPrice",
        header: "Asking",
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-bold text-slate-950">
            {formatMoney(row.original.askingPrice)}
          </span>
        ),
      },
      {
        accessorKey: "mileage",
        header: "Mileage",
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatNumber(row.original.mileage)}</span>
        ),
      },
      {
        id: "adjustedPrice",
        header: "Adjusted to Subject",
        accessorFn: (row) =>
          calculateAdjustedCompPrice({ comp: row, targetMileage, assumptions }),
        cell: ({ row }) => {
          const mileage = calculateMileageAdjustment({
            comp: row.original,
            targetMileage,
            assumptions,
          });
          return (
            <div className="min-w-[100px]">
              <span className="whitespace-nowrap font-extrabold text-blue-700">
                {formatMoney(
                  calculateAdjustedCompPrice({
                    comp: row.original,
                    targetMileage,
                    assumptions,
                  }),
                )}
              </span>
              <div className="mt-1 text-[9px] font-semibold text-slate-400">
                to {formatNumber(targetMileage)} mi
              </div>
              {mileage.capped || mileage.reliability !== "normal" ? (
                <div className="mt-1 text-[9px] font-bold text-amber-700">
                  {mileage.capped ? "Mileage cap applied" : "Large mileage gap"}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "qualityScore",
        header: "Match Score",
        cell: ({ row }) => {
          const score = row.original.qualityScore;
          const rejected = row.original.equivalenceTier === "reject";
          const tone = rejected
            ? "bg-red-100 text-red-700"
            : score >= 85
              ? "bg-emerald-100 text-emerald-700"
              : score >= 70
                ? "bg-blue-100 text-blue-700"
                : score >= 60
                  ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700";
          return (
            <div className="min-w-[88px]">
              <span
                title={
                  rejected
                    ? "This listing failed a hard vehicle-identity rule; open Details to see why."
                    : "Open Details to see why this comp received its score"
                }
                className={`inline-flex min-w-9 justify-center rounded-full px-2 py-1 text-xs font-black ${tone}`}
              >
                {rejected ? "Rejected" : score}
              </span>
              <div className="mt-1 text-[9px] font-bold text-slate-400">
                {inferredListingConfidence(row.original)} data
              </div>
            </div>
          );
        },
      },
      {
        id: "details",
        header: "",
        enableSorting: false,
        cell: () => (
          <span className="whitespace-nowrap text-xs font-black text-blue-700">
            Why? →
          </span>
        ),
      },
    ],
    [assumptions, onToggleIncluded, targetMileage],
  );

  const table = useReactTable({
    data: comps,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (!comps.length) {
    return (
      <div className="flex min-h-56 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-6 text-center">
        <div>
          <div className="text-sm font-extrabold text-slate-800">
            No comparable vehicles loaded
          </div>
          <div className="mt-1 text-sm text-slate-500">
            Run the evaluation to search for a usable comp set.
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="overflow-auto rounded-2xl border border-slate-200"
        style={
          maxVisibleRows && comps.length > maxVisibleRows
            ? { maxHeight: `${48 + maxVisibleRows * 62}px` }
            : undefined
        }
      >
        <table className="min-w-[1180px] w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 shadow-[0_1px_0_rgba(148,163,184,0.25)]">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      className={`whitespace-nowrap px-3 py-3 ${canSort ? "cursor-pointer select-none" : ""}`}
                      onClick={
                        canSort ? header.column.getToggleSortingHandler() : undefined
                      }
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span className="text-slate-400">
                          {sorted === "asc" ? "↑" : sorted === "desc" ? "↓" : ""}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                tabIndex={0}
                role="button"
                onClick={() => setSelectedComp(row.original)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedComp(row.original);
                  }
                }}
                className={
                  row.original.included
                    ? "cursor-pointer transition hover:bg-blue-50/50 focus:bg-blue-50/50 focus:outline-none"
                    : "cursor-pointer bg-slate-50/70 text-slate-400 transition hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold leading-5 text-slate-600">
        <span className="font-black text-slate-900">Comp hierarchy:</span>{" "}
        Direct and Near comps may be auto-included when they pass the quality floor. Supporting comps require a dealer check. Rejected matches stay excluded unless you deliberately select them; dealer overrides lower confidence. Mileage normalization is nonlinear and capped.
      </div>

      {selectedComp && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-[5vh] backdrop-blur-sm"
              onClick={() => setSelectedComp(null)}
            >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Comparable vehicle details"
            className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">
                  MarketCheck Comparable
                </div>
                <h2 className="mt-1 text-xl font-black text-slate-950">
                  {selectedComp.year} {selectedComp.model}
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {selectedComp.trim || "Trim unavailable"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedComp(null)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-800"
                aria-label="Close comparable details"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[calc(90vh-92px)] overflow-y-auto px-6 py-5">
              <CompFitExplanation
                comp={selectedComp}
                targetMileage={targetMileage}
                assumptions={assumptions}
              />

              {selectedComp.imageUrl ? (
                <img
                  src={selectedComp.imageUrl}
                  alt={`${selectedComp.year} ${selectedComp.model}`}
                  className="mb-5 h-56 w-full rounded-2xl bg-slate-100 object-cover"
                />
              ) : null}

              <section>
                <h3 className="text-sm font-black text-slate-950">Vehicle and listing</h3>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <DetailItem label="VIN" value={selectedComp.marketCheckDetails?.vin} />
                  <DetailItem label="Trim" value={selectedComp.trim} />
                  <DetailItem label="Body Type" value={selectedComp.marketCheckDetails?.bodyType} />
                  <DetailItem label="Drivetrain" value={selectedComp.marketCheckDetails?.drivetrain} />
                  <DetailItem label="Transmission" value={selectedComp.marketCheckDetails?.transmission} />
                  <DetailItem label="Fuel Type" value={selectedComp.marketCheckDetails?.fuelType} />
                  <DetailItem label="Engine" value={selectedComp.marketCheckDetails?.engine} />
                  <DetailItem label="Cylinders" value={selectedComp.marketCheckDetails?.cylinders} />
                  <DetailItem label="Exterior" value={selectedComp.marketCheckDetails?.exteriorColor} />
                  <DetailItem label="Interior" value={selectedComp.marketCheckDetails?.interiorColor} />
                  <DetailItem label="Mileage" value={`${formatNumber(selectedComp.mileage)} mi`} />
                  <DetailItem label="Asking Price" value={formatMoney(selectedComp.askingPrice)} />
                </dl>
              </section>

              <section className="mt-6">
                <h3 className="text-sm font-black text-slate-950">Seller and location</h3>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <DetailItem label="Dealer" value={selectedComp.marketCheckDetails?.dealerName} />
                  <DetailItem label="Seller Type" value={selectedComp.marketCheckDetails?.sellerType} />
                  <DetailItem label="Phone" value={selectedComp.marketCheckDetails?.dealerPhone} />
                  <DetailItem label="City" value={selectedComp.marketCheckDetails?.city} />
                  <DetailItem label="State" value={selectedComp.marketCheckDetails?.state} />
                  <DetailItem label="ZIP" value={selectedComp.marketCheckDetails?.zip} />
                  <DetailItem label="Distance" value={`${formatNumber(selectedComp.distance)} mi`} />
                  <DetailItem label="Search Region" value={selectedComp.region} />
                </dl>
                {selectedComp.marketCheckDetails?.listingUrl ? (
                  <a
                    href={selectedComp.marketCheckDetails.listingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex rounded-xl bg-blue-700 px-4 py-2 text-sm font-black text-white hover:bg-blue-800"
                  >
                    Open original listing ↗
                  </a>
                ) : null}
              </section>

              <section className="mt-6">
                <h3 className="text-sm font-black text-slate-950">Market and Lot Logic</h3>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <DetailItem label="Vehicle Relationship" value={tierLabel(selectedComp)} />
                  <DetailItem
                    label="Identity Verification"
                    value={
                      selectedComp.marketCheckDetails?.identityVerification?.source ===
                      "nhtsa-vin"
                        ? "Verified from listing VIN"
                        : selectedComp.needsClassificationReview
                          ? "Needs verification"
                          : "Provider data"
                    }
                  />
                  <DetailItem label="Equivalence Reasons" value={selectedComp.equivalenceReasons} />
                  <DetailItem label="Target Classification" value={selectedComp.targetClassification} />
                  <DetailItem label="Candidate Classification" value={selectedComp.candidateClassification} />
                  <DetailItem label="Dealer Days" value={selectedComp.dealerDays} />
                  <DetailItem label="Market Days" value={selectedComp.marketDays} />
                  <DetailItem label="Listing Date" value={selectedComp.marketCheckDetails?.listingDate} />
                  <DetailItem label="Last Seen" value={selectedComp.marketCheckDetails?.lastSeenDate} />
                  <DetailItem
                    label="Match Score"
                    value={
                      selectedComp.equivalenceTier === "reject"
                        ? "Rejected by vehicle identity"
                        : selectedComp.qualityScore
                    }
                  />
                  <DetailItem label="Listing Confidence" value={inferredListingConfidence(selectedComp)} />
                  <DetailItem label="Included" value={selectedComp.included} />
                  <DetailItem
                    label="Adjusted Value"
                    value={formatMoney(
                      calculateAdjustedCompPrice({
                        comp: selectedComp,
                        targetMileage,
                        assumptions,
                      }),
                    )}
                  />
                </dl>
              </section>

              {selectedComp.marketCheckDetails?.raw ? (
                <details className="mt-6 rounded-2xl border border-slate-200 bg-slate-50">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-black text-slate-700">
                    View raw MarketCheck response
                  </summary>
                  <pre className="max-h-96 overflow-auto border-t border-slate-200 p-4 text-xs leading-5 text-slate-600">
                    {JSON.stringify(selectedComp.marketCheckDetails.raw, null, 2)}
                  </pre>
                </details>
              ) : null}
            </div>
          </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
