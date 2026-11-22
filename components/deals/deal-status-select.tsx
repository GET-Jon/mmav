"use client";

import { useState } from "react";

const statusOptions = [
  { value: "undecided", label: "Undecided" },
  { value: "watching", label: "Watching" },
  { value: "needs_review", label: "Needs review" },
  { value: "bid", label: "Bid placed" },
  { value: "passed", label: "Passed" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "purchased", label: "Purchased" },
  { value: "archived", label: "Archived" },
];

const outcomeReasonOptions = [
  { value: "price", label: "Price or target" },
  { value: "condition_title", label: "Condition or title" },
  { value: "market_confidence", label: "Market or valuation" },
  { value: "seller", label: "Seller or deal fell through" },
  { value: "timing", label: "Timing or availability" },
  { value: "other", label: "Other" },
];

function normalizeStatus(value?: string | null) {
  return String(value || "undecided").trim() || "undecided";
}

function statusClass(status: string) {
  switch (status) {
    case "bid":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "won":
    case "purchased":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "passed":
    case "lost":
    case "archived":
      return "border-slate-200 bg-slate-100 text-slate-700";
    case "needs_review":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "undecided":
      return "border-slate-200 bg-slate-50 text-slate-500";
    default:
      return "border-slate-200 bg-white text-slate-700";
  }
}

const isRecordedOutcome = (status: string) =>
  ["passed", "won", "lost", "purchased"].includes(status);

export function DealStatusSelect({
  evaluationId,
  status,
  outcomeReason,
  onStatusChange,
}: {
  evaluationId: string;
  status?: string | null;
  outcomeReason?: string | null;
  onStatusChange?: (
    evaluationId: string,
    status: string,
    outcomeReason: string | null,
  ) => void;
}) {
  const normalizedStatus = normalizeStatus(status);
  const [localStatus, setLocalStatus] = useState(normalizedStatus);
  const [localReason, setLocalReason] = useState(outcomeReason || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function updateStatus(nextStatus: string, nextReason: string | null) {
    const previousStatus = localStatus;
    const previousReason = localReason;

    setLocalStatus(nextStatus);
    setLocalReason(nextReason || "");
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/evaluations/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: evaluationId,
          status: nextStatus,
          outcomeReason: nextReason,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Status update failed.");
      }

      onStatusChange?.(evaluationId, nextStatus, nextReason);
    } catch (updateError) {
      setLocalStatus(previousStatus);
      setLocalReason(previousReason);
      setError(
        updateError instanceof Error ? updateError.message : "Status update failed.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleSelection(nextStatus: string) {
    setError("");
    if (nextStatus === localStatus) return;

    const keepsReason = ["passed", "lost"].includes(nextStatus);
    void updateStatus(nextStatus, keepsReason ? localReason || null : null);
  }

  function handleReasonSelection(nextReason: string) {
    if (nextReason === localReason) return;
    void updateStatus(localStatus, nextReason || null);
  }

  const asksForReason = ["passed", "lost"].includes(localStatus);

  return (
    <div className="space-y-1.5">
      <select
        value={localStatus}
        disabled={saving}
        onChange={(event) => handleSelection(event.target.value)}
        className={`w-full rounded-full border px-3 py-1.5 text-sm font-bold outline-none ${statusClass(localStatus)}`}
        aria-label="Dealer follow-up status"
      >
        {statusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {isRecordedOutcome(localStatus) ? (
        <div className="text-[11px] font-bold text-emerald-700">✓ Outcome recorded</div>
      ) : null}

      {asksForReason ? (
        <select
          value={localReason}
          disabled={saving}
          onChange={(event) => handleReasonSelection(event.target.value)}
          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 outline-none focus:border-blue-400"
          aria-label="Optional reason for passed or lost deal"
        >
          <option value="">Why? (optional)</option>
          {outcomeReasonOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}

      {error ? <div className="text-xs font-semibold text-red-600">{error}</div> : null}
    </div>
  );
}