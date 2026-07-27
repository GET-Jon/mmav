"use client";

import { useCallback, useEffect, useState } from "react";

import { PurchaseConfirmationModal } from "@/components/mindful-inventory/purchase-confirmation-modal";

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
  onStatusChange?: (
    evaluationId: string,
    status: string,
  ) => void;
}) {
  const normalizedStatus = normalizeStatus(status);

  const [localStatus, setLocalStatus] =
    useState(normalizedStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [purchaseModalOpen, setPurchaseModalOpen] =
    useState(false);

  useEffect(() => {
    setLocalStatus(normalizedStatus);
  }, [normalizedStatus]);

  const closePurchaseModal = useCallback(() => {
    if (saving) {
      return;
    }

    setPurchaseModalOpen(false);
    setError("");
  }, [saving]);

  async function updateStandardStatus(nextStatus: string) {
    const previousStatus = localStatus;

    setLocalStatus(nextStatus);
    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        "/api/evaluations/status",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: evaluationId,
            status: nextStatus,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Status update failed.",
        );
      }

      onStatusChange?.(evaluationId, nextStatus);
    } catch (updateError) {
      setLocalStatus(previousStatus);
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Status update failed.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmPurchaseAndImport() {
    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        "/api/mindful/inventory/import-evaluation",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            evaluationId,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to add vehicle to Inventory.",
        );
      }

      setLocalStatus("purchased");
      setPurchaseModalOpen(false);
      onStatusChange?.(evaluationId, "purchased");
    } catch (purchaseError) {
      setError(
        purchaseError instanceof Error
          ? purchaseError.message
          : "Failed to add vehicle to Inventory.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleSelection(nextStatus: string) {
    setError("");

    if (
      nextStatus === "purchased" &&
      localStatus !== "purchased"
    ) {
      setPurchaseModalOpen(true);
      return;
    }

    if (nextStatus === localStatus) {
      return;
    }

    void updateStandardStatus(nextStatus);
  }

  return (
    <>
      <div className="space-y-1">
        <select
          value={localStatus}
          disabled={saving}
          onChange={(event) =>
            handleSelection(event.target.value)
          }
          className={`w-full rounded-full border px-3 py-1.5 text-sm font-bold outline-none ${statusClass(
            localStatus,
          )}`}
        >
          {statusOptions.map((option) => (
            <option
              key={option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>

        {error && !purchaseModalOpen ? (
          <div className="text-xs font-semibold text-red-600">
            {error}
          </div>
        ) : null}
      </div>

      <PurchaseConfirmationModal
        open={purchaseModalOpen}
        saving={saving}
        error={purchaseModalOpen ? error : ""}
        onCancel={closePurchaseModal}
        onConfirm={() => {
          void confirmPurchaseAndImport();
        }}
      />
    </>
  );
}
