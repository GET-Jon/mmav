"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DealStatusSelect } from "@/components/deals/deal-status-select";

type SavedEvaluation = {
  id: string;
  created_at: string;
  updated_at: string;
  status: string | null;
  payload?: Record<string, unknown> | null;
  outcome_reason?: string | null;
  outcome_recorded_at?: string | null;
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
  created_by?: string | null;
  updated_by?: string | null;
  created_by_email?: string | null;
  updated_by_email?: string | null;
  created_by_label?: string | null;
  updated_by_label?: string | null;
};

type CompanyUserOption = {
  id: string;
  email: string | null;
  label: string;
};

const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "undecided", label: "Undecided" },
  { value: "watching", label: "Watching" },
  { value: "needs_review", label: "Needs Review" },
  { value: "bid", label: "Bid" },
  { value: "passed", label: "Passed" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "purchased", label: "Purchased" },
  { value: "archived", label: "Archived" },
];

const sortOptions = [
  { value: "updated", label: "Recently Updated" },
  { value: "profit", label: "Highest Profit" },
  { value: "currentBid", label: "Highest Current Bid" },
  { value: "mileage", label: "Lowest Mileage" },
];

function normalizeStatus(value?: string | null) {
  return String(value || "undecided").trim().toLowerCase() || "undecided";
}

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

function formatSavedDate(value: string) {
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", timeZone: "America/New_York" }).format(date),
    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(date),
  };
}

function isRecordedOutcome(status?: string | null) {
  return ["passed", "won", "lost", "purchased"].includes(normalizeStatus(status));
}

function decisionClass(decision: string | null) {
  const normalized = String(decision || "").toLowerCase();

  if (normalized === "pass" || normalized === "pass on this vehicle") {
    return "bg-red-100 text-red-700";
  }

  if (
    normalized.includes("review") ||
    normalized.includes("verify") ||
    normalized.includes("condition") ||
    normalized.includes("promising") ||
    normalized.includes("above target")
  ) {
    return "bg-amber-100 text-amber-800";
  }

  if (normalized === "—" || !normalized) {
    return "bg-slate-100 text-slate-600";
  }

  return "bg-emerald-100 text-emerald-700";
}

function recommendationLabel(evaluation: SavedEvaluation) {
  const payload = evaluation.payload || {};
  const snapshot =
    payload.pipelineRecommendation &&
    typeof payload.pipelineRecommendation === "object" &&
    !Array.isArray(payload.pipelineRecommendation)
      ? (payload.pipelineRecommendation as Record<string, unknown>)
      : {};
  const savedLabel = snapshot.label;
  if (typeof savedLabel === "string" && savedLabel.trim()) return savedLabel;

  const key =
    typeof snapshot.key === "string"
      ? snapshot.key
      : typeof payload.presentationDecision === "string"
        ? payload.presentationDecision
        : "";
  const labels: Record<string, string> = {
    awaiting: "Evaluation incomplete",
    searching: "Checking market",
    comps: "Verify pricing",
    condition: "Review condition",
    pass: "Pass",
    promising: "Promising — negotiate",
    review: "Review required",
    pursue: "Worth pursuing",
  };
  return labels[key] || evaluation.decision || "—";
}

function compactUserLabel(emailOrName?: string | null) {
  const clean = String(emailOrName || "").trim();

  if (!clean) {
    return "—";
  }

  const beforeAt = clean.includes("@") ? clean.split("@")[0] : clean;
  const firstPart = beforeAt.split(/[._\-\s]+/).filter(Boolean)[0] || beforeAt;

  if (!firstPart) {
    return clean.slice(0, 5);
  }

  const normalized =
    firstPart.charAt(0).toUpperCase() + firstPart.slice(1).toLowerCase();

  return normalized.length <= 10 ? normalized : normalized.slice(0, 5);
}

export function DealsPipelineTable({
  evaluations,
  companyUsers,
}: {
  evaluations: SavedEvaluation[];
  companyUsers: CompanyUserOption[];
}) {
  const [tableEvaluations, setTableEvaluations] = useState<SavedEvaluation[]>(
    evaluations
  );
  const [statusFilter, setStatusFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [sortBy, setSortBy] = useState("updated");
  const [searchText, setSearchText] = useState("");
  const [outcomeEvaluationId, setOutcomeEvaluationId] = useState<string | null>(null);
  const [outcomeReason, setOutcomeReason] = useState("");
  const [outcomeSaving, setOutcomeSaving] = useState(false);
  const [outcomeError, setOutcomeError] = useState("");

  const outcomeEvaluation = tableEvaluations.find((evaluation) => evaluation.id === outcomeEvaluationId);

  function openOutcomeDialog(evaluation: SavedEvaluation) {
    setOutcomeEvaluationId(evaluation.id);
    const savedReason = evaluation.outcome_reason || "";
    const legacyReasonLabels: Record<string, string> = {
      price: "Price or target",
      condition_title: "Condition or title",
      market_confidence: "Market or valuation",
      seller: "Seller or deal fell through",
      timing: "Timing or availability",
      other: "Other",
    };
    setOutcomeReason(legacyReasonLabels[savedReason] || savedReason);
    setOutcomeError("");
  }

  async function saveOutcome() {
    if (!outcomeEvaluation) return;
    setOutcomeSaving(true);
    setOutcomeError("");
    try {
      const response = await fetch("/api/evaluations/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: outcomeEvaluation.id,
          status: normalizeStatus(outcomeEvaluation.status),
          outcomeReason: outcomeReason.trim() || null,
          recordOutcome: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not record the outcome.");
      setTableEvaluations((previous) => previous.map((evaluation) =>
        evaluation.id === outcomeEvaluation.id
          ? { ...evaluation, outcome_reason: data.outcomeReason ?? null, outcome_recorded_at: data.outcomeRecordedAt, updated_at: data.updatedAt || evaluation.updated_at }
          : evaluation
      ));
      setOutcomeEvaluationId(null);
    } catch (error) {
      setOutcomeError(error instanceof Error ? error.message : "Could not record the outcome.");
    } finally {
      setOutcomeSaving(false);
    }
  }

  function handleStatusChange(evaluationId: string, nextStatus: string) {
    setTableEvaluations((previous) =>
      previous.map((evaluation) =>
        evaluation.id === evaluationId
          ? { ...evaluation, status: nextStatus, updated_at: new Date().toISOString() }
          : evaluation
      )
    );
  }

  const userOptions = useMemo(() => {
    return [...companyUsers].sort((a, b) => a.label.localeCompare(b.label));
  }, [companyUsers]);

  const filteredEvaluations = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return tableEvaluations
      .filter((evaluation) => {
        const currentStatus = normalizeStatus(evaluation.status);

        if (statusFilter !== "all" && currentStatus !== statusFilter) {
          return false;
        }

        const rowUserId = evaluation.created_by || evaluation.updated_by || "";

        if (userFilter !== "all" && rowUserId !== userFilter) {
          return false;
        }

        if (normalizedSearch) {
          const haystack = [
            evaluation.vehicle_title,
            evaluation.vin,
            evaluation.auction_site,
            evaluation.risk_grade,
            evaluation.decision,
            evaluation.created_by_email,
            evaluation.updated_by_email,
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

        if (sortBy === "currentBid") {
          return (b.current_bid || 0) - (a.current_bid || 0);
        }

        if (sortBy === "mileage") {
          return (
            (a.mileage || Number.MAX_SAFE_INTEGER) -
            (b.mileage || Number.MAX_SAFE_INTEGER)
          );
        }

        return (
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
      });
  }, [tableEvaluations, statusFilter, userFilter, sortBy, searchText]);

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
              placeholder="Vehicle, VIN, user..."
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
              User
            </div>
            <select
              value={userFilter}
              onChange={(event) => setUserFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none"
            >
              <option value="all">All users</option>
              {userOptions.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.label}
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
          Showing {filteredEvaluations.length} of {tableEvaluations.length} saved
          evaluations
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1060px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[4%]" />
            <col className="w-[8%]" />
            <col className="w-[6%]" />
            <col className="w-[12%]" />
            <col className="w-[27%]" />
            <col className="w-[8%]" />
            <col className="w-[9%]" />
            <col className="w-[8%]" />
            <col className="w-[7%]" />
            <col className="w-[11%]" />
          </colgroup>
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-2 py-3" aria-label="Outcome recorded" />
              <th className="px-4 py-3">Saved</th>
              <th className="px-4 py-3">By</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Mileage</th>
              <th className="whitespace-nowrap px-3 py-3">Current Bid</th>
              <th className="px-4 py-3">Profit</th>
              <th className="px-4 py-3">Risk</th>
              <th className="whitespace-nowrap px-3 py-3">Lot Logic recommendation</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {filteredEvaluations.map((evaluation) => (
              <tr
                key={evaluation.id}
                className={
                  normalizeStatus(evaluation.status) === "undecided"
                    ? "bg-slate-50/70 hover:bg-slate-100"
                    : "hover:bg-slate-50"
                }
              >
                <td className="px-2 py-3 text-center">
                  {isRecordedOutcome(evaluation.status) ? (
                    <button type="button" onClick={() => openOutcomeDialog(evaluation)}
                      title={evaluation.outcome_recorded_at ? "Edit outcome note" : "Record outcome"}
                      aria-label={evaluation.outcome_recorded_at ? "Edit outcome note" : "Record outcome"}
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-md border text-sm font-black transition ${
                        evaluation.outcome_recorded_at ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-transparent hover:border-emerald-500"
                      }`}>✓</button>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-slate-500">
                  <div className="flex flex-col text-xs leading-4">
                    <span>{formatSavedDate(evaluation.updated_at).date}</span>
                    <span>{formatSavedDate(evaluation.updated_at).time}</span>
                  </div>
                </td>

                <td className="px-4 py-3 font-semibold text-slate-700">
                  {evaluation.created_by_label ||
                    evaluation.updated_by_label ||
                    compactUserLabel(
                      evaluation.created_by_email || evaluation.updated_by_email
                    )}
                </td>

                <td className="min-w-[140px] px-4 py-3">
                  <DealStatusSelect
                    evaluationId={evaluation.id}
                    status={evaluation.status}
                    onStatusChange={handleStatusChange}
                  />
                </td>

                <td className="px-3 py-3 font-semibold">
                  <Link
                    href={`/deals/${evaluation.id}`}
                    title={evaluation.vehicle_title || "Untitled Vehicle"}
                    className="block truncate text-blue-700 hover:underline"
                  >
                    {evaluation.vehicle_title || "Untitled Vehicle"}
                  </Link>
                </td>

                <td className="whitespace-nowrap px-3 py-3">
                  {number(evaluation.mileage)}
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  {money(evaluation.current_bid)}
                </td>

                <td className="whitespace-nowrap px-3 py-3 font-semibold">
                  {money(evaluation.expected_gross_profit)}
                </td>

                <td className="whitespace-nowrap px-3 py-3">
                  {evaluation.risk_grade || "—"}
                </td>

                <td className="whitespace-nowrap px-3 py-3">
                  <span
                    className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${decisionClass(
                      recommendationLabel(evaluation)
                    )}`}
                  >
                    {recommendationLabel(evaluation)}
                  </span>
                  {evaluation.decision &&
                  recommendationLabel(evaluation) !== evaluation.decision ? (
                    <div className="mt-1 text-[11px] text-slate-500">
                      Bid guidance: {evaluation.decision}
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}

            {filteredEvaluations.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-8 text-center text-slate-500"
                  colSpan={10}
                >
                  No saved evaluations match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {outcomeEvaluation ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget && !outcomeSaving) setOutcomeEvaluationId(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="outcome-dialog-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="outcome-dialog-title" className="text-lg font-black text-slate-950">Tell AI why, for improved recommendations</h2>
                <p className="mt-1 text-sm text-slate-600">Mark the outcome recorded now. A short note is optional and helps Lot Logic improve future recommendations.</p>
              </div>
              <button type="button" onClick={() => setOutcomeEvaluationId(null)} disabled={outcomeSaving} aria-label="Close" className="rounded-lg px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700">×</button>
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800">{outcomeEvaluation.vehicle_title || "Untitled Vehicle"}</div>
            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">What influenced the decision? <span className="font-medium normal-case">(optional)</span></span>
              <textarea value={outcomeReason} onChange={(event) => setOutcomeReason(event.target.value)} maxLength={1200} rows={4}
                placeholder="For example: condition, seller response, final price, or something the estimate missed."
                className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              <span className="mt-1 block text-right text-xs text-slate-400">{outcomeReason.length}/1,200</span>
            </label>
            {outcomeError ? <p className="mt-2 text-sm font-semibold text-red-600">{outcomeError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOutcomeEvaluationId(null)} disabled={outcomeSaving} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void saveOutcome()} disabled={outcomeSaving} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">{outcomeSaving ? "Saving…" : "Mark outcome recorded"}</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
