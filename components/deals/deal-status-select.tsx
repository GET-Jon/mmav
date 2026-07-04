"use client";

import { useEffect, useState } from "react";

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

function normalizeStatus(value?: string | null) {
  return String(value || "watching").trim() || "watching";
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
      return "border-red-200 bg-red-50 text-red-700";
    case "needs_review":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export function DealStatusSelect({
  evaluationId,
  status,
  onStatusChange,
}: {
  evaluationId: string;
  status?: string | null;
  onStatusChange?: (evaluationId: string, status: string) => void;
}) {
  const normalizedStatus = normalizeStatus(status);
  const [localStatus, setLocalStatus] = useState(normalizedStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLocalStatus(normalizedStatus);
  }, [normalizedStatus]);

  async function updateStatus(nextStatus: string) {
    const previousStatus = localStatus;

    setLocalStatus(nextStatus);
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

      onStatusChange?.(evaluationId, nextStatus);
    } catch (updateError) {
      setLocalStatus(previousStatus);
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
        value={localStatus}
        disabled={saving}
        onChange={(event) => updateStatus(event.target.value)}
        className={`w-full rounded-full border px-3 py-1.5 text-sm font-bold outline-none ${statusClass(
          localStatus
        )}`}
      >
        {statusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {error ? (
        <div className="text-xs font-semibold text-red-600">{error}</div>
      ) : null}
    </div>
  );
}
