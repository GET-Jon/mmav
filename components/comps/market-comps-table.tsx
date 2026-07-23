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

  const columns = useMemo<ColumnDef<MarketComp>[]>(
    () => [
      {
        accessorKey: "included",
        header: "",
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.original.included}
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
        accessorFn: (row) =>
          [row.year, row.model, row.trim].filter(Boolean).join(" "),
        cell: ({ row }) => (
          <div className="min-w-[155px]">
            <div className="font-bold text-slate-950">
              {[row.original.year, row.original.model]
                .filter(Boolean)
                .join(" ")}
            </div>

            <div className="mt-0.5 truncate text-xs font-medium text-slate-500">
              {row.original.trim || "Trim unavailable"}
            </div>
          </div>
        ),
      },
      {
        id: "source",
        header: "Source",
        accessorFn: (row) => row.source,
        cell: ({ row }) => (
          <div className="min-w-[105px]">
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
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="min-w-[850px] w-full text-left text-sm">
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
              className={
                row.original.included
                  ? "transition hover:bg-slate-50/80"
                  : "bg-slate-50/70 text-slate-400"
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
  );
}
