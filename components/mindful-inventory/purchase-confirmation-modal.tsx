"use client";

import { useEffect } from "react";

type PurchaseConfirmationModalProps = {
  open: boolean;
  saving: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function PurchaseConfirmationModal({
  open,
  saving,
  error = "",
  onCancel,
  onConfirm,
}: PurchaseConfirmationModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        onCancel();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, saving, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="purchase-confirmation-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) {
          onCancel();
        }
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-100 text-xl">
            ✓
          </div>

          <div>
            <h2
              id="purchase-confirmation-title"
              className="text-xl font-black tracking-[-0.025em] text-slate-950"
            >
              Add this vehicle to Inventory?
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Confirming will mark this evaluation as Purchased and
              create a one-time vehicle record in Mindful Inventory.
            </p>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Future Inventory changes will not alter the original
              Lot Logic evaluation.
            </p>
          </div>
        </div>

        {error ? (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={onConfirm}
            className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving
              ? "Adding to Inventory..."
              : "Confirm and Add to Inventory"}
          </button>
        </div>
      </div>
    </div>
  );
}
