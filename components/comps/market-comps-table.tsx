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
import { calculateAdjustedCompPrice } from "@/lib/comps";
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
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
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

export function MarketCompsTable({
  comps,
  targetMileage,
  assumptions,
  onToggleIncluded,
}: {
  comps: MarketComp[];
  targetMileage: number;
  assumptions: Assumptions;
  onToggleIncluded: (id: string) => void;
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
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.original.included}
            onClick={(event) => event.stopPropagation()}
            onChange={() => onToggleIncluded(row.original.id)}
            aria-label={`Include ${row.original.year} ${row.original.model}`}
            className="h-4 w-4 rounded border-slate-300 accent-blue-700"
          />
        ),
        enableSorting: false,
      },
      {
        id: "vehicle",
        header: "Vehicle",
        accessorFn: (row) => [row.year, row.model].filter(Boolean).join(" "),
        cell: ({ row }) => (
          <div className="min-w-[180px]">
            <div className="font-bold text-slate-950">
              {[row.original.year, row.original.model]
                .filter(Boolean)
                .join(" ")}
            </div>
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
          </div>
        ),
      },
      {
        id: "source",
        header: "Source",
        accessorFn: (row) => row.source,
        cell: ({ row }) => (
          <div className="min-w-[120px]">
            <div className="font-semibold text-slate-900">
              {row.original.source}
            </div>
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
          <span className="whitespace-nowrap">
            {formatNumber(row.original.mileage)}
          </span>
        ),
      },
      {
        accessorKey: "distance",
        header: "Distance",
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {formatNumber(row.original.distance)} mi
          </span>
        ),
      },
      {
        id: "adjustedPrice",
        header: "Adjusted",
        accessorFn: (row) =>
          calculateAdjustedCompPrice({
            comp: row,
            targetMileage,
            assumptions,
          }),
        cell: ({ row }) => {
          const adjusted = calculateAdjustedCompPrice({
            comp: row.original,
            targetMileage,
            assumptions,
          });

          return (
            <span className="whitespace-nowrap font-extrabold text-blue-700">
              {formatMoney(adjusted)}
            </span>
          );
        },
      },
      {
        accessorKey: "qualityScore",
        header: "Score",
        cell: ({ row }) => {
          const score = row.original.qualityScore;

          const tone =
            score >= 70
              ? "bg-emerald-100 text-emerald-700"
              : score >= 60
                ? "bg-amber-100 text-amber-700"
                : "bg-red-100 text-red-700";

          return (
            <span
              className={`inline-flex min-w-9 justify-center rounded-full px-2 py-1 text-xs font-black ${tone}`}
            >
              {score}
            </span>
          );
        },
      },
      {
        id: "details",
        header: "",
        enableSorting: false,
        cell: () => (
          <span className="whitespace-nowrap text-xs font-black text-blue-700">
            Details →
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
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-[1120px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();

                  return (
                    <th
                      key={header.id}
                      className={`whitespace-nowrap px-3 py-3 ${
                        canSort ? "cursor-pointer select-none" : ""
                      }`}
                      onClick={
                        canSort
                          ? header.column.getToggleSortingHandler()
                          : undefined
                      }
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        <span className="text-slate-400">
                          {sorted === "asc"
                            ? "↑"
                            : sorted === "desc"
                              ? "↓"
                              : ""}
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

      {selectedComp ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
          onClick={() => setSelectedComp(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Comparable vehicle details"
            className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
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
              {selectedComp.imageUrl ? (
                <img
                  src={selectedComp.imageUrl}
                  alt={`${selectedComp.year} ${selectedComp.model}`}
                  className="mb-5 h-56 w-full rounded-2xl bg-slate-100 object-cover"
                />
              ) : null}

              <section>
                <h3 className="text-sm font-black text-slate-950">
                  Vehicle and listing
                </h3>

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
                <h3 className="text-sm font-black text-slate-950">
                  Seller and location
                </h3>

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
                <h3 className="text-sm font-black text-slate-950">
                  Market and Lot Logic
                </h3>

                <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <DetailItem label="Dealer Days" value={selectedComp.dealerDays} />
                  <DetailItem label="Market Days" value={selectedComp.marketDays} />
                  <DetailItem label="Listing Date" value={selectedComp.marketCheckDetails?.listingDate} />
                  <DetailItem label="Last Seen" value={selectedComp.marketCheckDetails?.lastSeenDate} />
                  <DetailItem label="Quality Score" value={selectedComp.qualityScore} />
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
                  <DetailItem label="Target Mileage" value={`${formatNumber(targetMileage)} mi`} />
                </dl>
              </section>

              {selectedComp.marketCheckDetails?.raw ? (
                <details className="mt-6 rounded-2xl border border-slate-200 bg-slate-50">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-black text-slate-700">
                    View raw MarketCheck response
                  </summary>
                  <pre className="max-h-96 overflow-auto border-t border-slate-200 p-4 text-xs leading-5 text-slate-600">
                    {JSON.stringify(
                      selectedComp.marketCheckDetails.raw,
                      null,
                      2,
                    )}
                  </pre>
                </details>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
