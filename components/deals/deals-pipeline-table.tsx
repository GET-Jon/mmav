"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DealStatusSelect } from "@/components/deals/deal-status-select";

type SavedEvaluation = {
  id: string;
  created_at: string;
  updated_at: string;
  status: string | null;
  vin: string | null;
  vehicle_title: string | null;
  mileage: number | null;
  current_bid: number | null;
  target_resale_used: number | null;
  safe_bid: number | null;
  max_smart_bid: number | null;
  stretch_bid: number | null;
  expected_gross_profit: number | null;
  decision: string | null;
  risk_grade: string | null;
  auction_site?: string | null;
};

const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "watching", label: "Watching" },
  { value: "needs_review", label: "Needs Review" },
  { value: "bid", label: "Bid" },
  { value: "passed", label: "Passed" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "purchased", label: "Purchased" },
  { value: "archived", label: "Archived" },
];

const sourceOptions = [
  "All sources",
  "ACV Auctions",
  "Manheim",
  "Cars & Bids",
  "Bring a Trailer",
  "Facebook",
  "Private Party",
  "Other",
];

const sortOptions = [
  { value: "updated", label: "Recently Updated" },
  { value: "profit", label: "Highest Profit" },
  { value: "maxSmart", label: "Highest Max Smart Bid" },
  { value: "currentBid", label: "Highest Current Bid" },
  { value: "mileage", label: "Lowest Mileage" },
];

function money(value: number | null) {
  if (value === null || value === undefined) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function number(value: number | null) {
  if (value === null || value === undefined) {
    return "—";
  }

  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function decisionClass(decision: string | null) {
  if (decision === "Pass") {
    return "bg-red-100 text-red-700";
  }

  if (decision === "Watch / Stretch Only") {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-emerald-100 text-emerald-700";
}

export function DealsPipelineTable({
  evaluations,
}: {
  evaluations: SavedEvaluation[];
}) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("All sources");
  const [sortBy, setSortBy] = useState("updated");
  const [searchText, setSearchText] = useState("");

  const filteredEvaluations = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return evaluations
      .filter((evaluation) => {
        if (statusFilter !== "all") {
          const currentStatus = evaluation.status || "watching";

          if (currentStatus !== statusFilter) {
            return false;
          }
        }

        if (sourceFilter !== "All sources") {
          if ((evaluation.auction_site || "") !== sourceFilter) {
            return false;
          }
        }

        if (normalizedSearch) {
          const haystack = [
            evaluation.vehicle_title,
            evaluation.vin,
            evaluation.auction_site,
            evaluation.risk_grade,
            evaluation.decision,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          if (!haystack.includes(normalizedSearch)) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "profit") {
          return (
            (b.expected_gross_profit || 0) - (a.expected_gross_profit || 0)
          );
        }

        if (sortBy === "maxSmart") {
          return (b.max_smart_bid || 0) - (a.max_smart_bid || 0);
        }

        if (sortBy === "currentBid") {
          return (b.current_bid || 0) - (a.current_bid || 0);
        }

        if (sortBy === "mileage") {
          return (a.mileage || Number.MAX_SAFE_INTEGER) -
            (b.mileage || Number.MAX_SAFE_INTEGER);
        }

        return (
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
      });
  }, [evaluations, statusFilter, sourceFilter, sortBy, searchText]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Search
            </div>
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Vehicle, VIN, source..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none"
            />
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Status
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Source
            </div>
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none"
            >
              {sourceOptions.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Sort
            </div>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 text-sm font-semibold text-slate-500">
          Showing {filteredEvaluations.length} of {evaluations.length} saved
          evaluations
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Saved</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">VIN</th>
              <th className="px-4 py-3">Mileage</th>
              <th className="px-4 py-3">Current Bid</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Max Smart</th>
              <th className="px-4 py-3">Profit</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3">Decision</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {filteredEvaluations.map((evaluation) => (
              <tr key={evaluation.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-500">
                  {formatDate(evaluation.updated_at)}
                </td>

                <td className="px-4 py-3">
                  <DealStatusSelect
                    evaluationId={evaluation.id}
                    initialStatus={evaluation.status}
                  />
                </td>

                <td className="px-4 py-3 font-semibold">
                  <Link
                    href={`/deals/${evaluation.id}`}
                    className="text-blue-700 hover:underline"
                  >
                    {evaluation.vehicle_title || "Untitled Vehicle"}
                  </Link>
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {evaluation.auction_site || "—"}
                </td>

                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                  {evaluation.vin || "—"}
                </td>

                <td className="px-4 py-3">{number(evaluation.mileage)}</td>
                <td className="px-4 py-3">{money(evaluation.current_bid)}</td>

                <td className="px-4 py-3">
                  {money(evaluation.target_resale_used)}
                </td>

                <td className="px-4 py-3 font-semibold text-blue-700">
                  {money(evaluation.max_smart_bid)}
                </td>

                <td className="px-4 py-3 font-semibold">
                  {money(evaluation.expected_gross_profit)}
                </td>

                <td className="px-4 py-3">{evaluation.risk_grade || "—"}</td>

                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-bold ${decisionClass(
                      evaluation.decision
                    )}`}
                  >
                    {evaluation.decision || "—"}
                  </span>
                </td>
              </tr>
            ))}

            {filteredEvaluations.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={12}>
                  No saved evaluations match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
