"use client";

import { InventoryPartSuggestionsV4 } from "@/components/mindful-inventory/inventory-part-suggestions-v4";
import type { InventoryPartView } from "@/lib/mindful-inventory/parts-transport";
import type { PartSearchSuggestion } from "@/lib/mindful-inventory/part-suggestions";

export function WorkOrderPartsModal({ vehicleId, workOrderId, workOrderTitle: _workOrderTitle, suggestion, parts, open, onClose }: {
  vehicleId: string;
  workOrderId: string;
  workOrderTitle: string;
  suggestion: PartSearchSuggestion;
  parts: InventoryPartView[];
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  const workOrderParts = parts.filter((part) => part.workOrderId === workOrderId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Active Work · Parts</div>
            <div className="mt-0.5 text-sm font-bold text-slate-600">Same parts workflow as Parts / Transport</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black">Close</button>
        </div>

        <div className="p-4 sm:p-5">
          <InventoryPartSuggestionsV4
            vehicleId={vehicleId}
            suggestions={[suggestion]}
            parts={workOrderParts}
          />
        </div>

        <div className="sticky bottom-0 flex justify-end border-t border-slate-200 bg-white px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">Done</button>
        </div>
      </div>
    </div>
  );
}
