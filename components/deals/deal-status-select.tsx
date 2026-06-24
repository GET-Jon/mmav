"use client";

import { useState } from "react";

const statusOptions = [
  { value: "watching", label: "Watching" },
  { value: "needs_review", label: "Needs Review" },
  { value: "bid", label: "Bid" },
  { value: "passed", label: "Passed" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "purchased", label: "Purchased" },
  { value: "archived", label: "Archived" },
];

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
      return "border-red-200 bg-red-50 text-red-700";
    case "needs_review":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export function DealStatusSelect({
  evaluationId,
  initialStatus,
}: {
  evaluationId: string;
  initialStatus?: string | null;
}) {
  const [status, setStatus] = useState(initialStatus || "watching");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function updateStatus(nextStatus: string) {
    const previousStatus = status;

    setStatus(nextStatus);
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/evaluations/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: evaluationId,
          status: nextStatus,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Status update failed.");
      }
    } catch (updateError) {
      setStatus(previousStatus);
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Status update failed."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1">
      <select
        value={status}
        disabled={saving}
        onChange={(event) => updateStatus(event.target.value)}
        className={`w-full rounded-full border px-2 py-1 text-xs font-bold outline-none ${statusClass(
          status
        )}`}
      >
        {statusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {error ? <div className="text-xs font-semibold text-red-600">{error}</div> : null}
    </div>
  );
}
