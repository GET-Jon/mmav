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

type MarketComp = {
  included: boolean;
  source: string;
  distance: number;
  year: number;
  model: string;
  trim: string;
  mileage: number;
  askingPrice: number;
  qualityScore: number;
};

const comps: MarketComp[] = [
  {
    included: true,
    source: "MarketCheck/API",
    distance: 18,
    year: 2020,
    model: "Audi Q7",
    trim: "Premium Plus",
    mileage: 63421,
    askingPrice: 34900,
    qualityScore: 78,
  },
  {
    included: true,
    source: "CarMax",
    distance: 25,
    year: 2020,
    model: "Audi Q7",
    trim: "Premium Plus",
    mileage: 70118,
    askingPrice: 33998,
    qualityScore: 74,
  },
  {
    included: true,
    source: "Facebook",
    distance: 12,
    year: 2020,
    model: "Audi Q7",
    trim: "Premium Plus",
    mileage: 66950,
    askingPrice: 32500,
    qualityScore: 68,
  },
  {
    included: true,
    source: "Manual",
    distance: 90,
    year: 2020,
    model: "Audi Q7",
    trim: "Premium Plus",
    mileage: 71230,
    askingPrice: 31900,
    qualityScore: 66,
  },
  {
    included: false,
    source: "MarketCheck/API",
    distance: 310,
    year: 2020,
    model: "Audi Q7",
    trim: "Premium Plus",
    mileage: 59880,
    askingPrice: 35900,
    qualityScore: 62,
  },
  {
    included: false,
    source: "CarMax",
    distance: 200,
    year: 2020,
    model: "Audi Q7",
    trim: "Premium Plus",
    mileage: 82111,
    askingPrice: 29998,
    qualityScore: 58,
  },
];

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

export function MarketCompsTable() {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "qualityScore", desc: true },
  ]);

  const columns = useMemo<ColumnDef<MarketComp>[]>(
    () => [
      {
        accessorKey: "included",
        header: "Include",
        cell: ({ row }) => (
          <input type="checkbox" checked={row.original.included} readOnly />
        ),
        enableSorting: true,
      },
      {
        accessorKey: "source",
        header: "Source",
        cell: ({ row }) => (
          <span className="font-medium text-slate-900">
            {row.original.source}
          </span>
        ),
      },
      {
        accessorKey: "distance",
        header: "Distance",
        cell: ({ row }) => `${row.original.distance} mi`,
      },
      {
        accessorKey: "year",
        header: "Year",
      },
      {
        accessorKey: "model",
        header: "Model",
      },
      {
        accessorKey: "trim",
        header: "Trim",
      },
      {
        accessorKey: "mileage",
        header: "Mileage",
        cell: ({ row }) => formatNumber(row.original.mileage),
      },
      {
        accessorKey: "askingPrice",
        header: "Asking",
        cell: ({ row }) => (
          <span className="font-semibold">
            {formatMoney(row.original.askingPrice)}
          </span>
        ),
      },
      {
        accessorKey: "qualityScore",
        header: "Score",
        cell: ({ row }) => {
          const score = row.original.qualityScore;
          const color =
            score >= 70
              ? "bg-emerald-100 text-emerald-700"
              : score >= 60
              ? "bg-amber-100 text-amber-700"
              : "bg-red-100 text-red-700";

          return (
            <span className={`rounded-full px-2 py-1 text-xs font-bold ${color}`}>
              {score}
            </span>
          );
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data: comps,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted();

                return (
                  <th
                    key={header.id}
                    className="cursor-pointer select-none px-3 py-3"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
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
              className={!row.original.included ? "bg-slate-50 text-slate-400" : ""}
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
