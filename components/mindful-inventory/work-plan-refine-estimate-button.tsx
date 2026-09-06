"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function WorkPlanRefineEstimateButton({ vehicleId, itemId }: { vehicleId: string; itemId: string }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  async function refine() {
    setWorking(true);
    setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/work-plan/refine-estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const data = await response.json() as { error?: string; estimatedCostLow?: number; estimatedCostHigh?: number };
      if (!response.ok) throw new Error(data.error || "Could not refine this estimate.");
      setMessage("Estimate refined ✓");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not refine this estimate.");
    } finally {
      setWorking(false);
    }
  }

  return <div className="mt-1.5">
    <button
      type="button"
      disabled={working}
      onClick={() => void refine()}
      title="Recalculate only this item's AI planning estimate using the latest vehicle, mechanical, partner, and parts evidence"
      className="cursor-pointer rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[11px] font-black text-violet-800 transition hover:bg-violet-100 disabled:cursor-wait disabled:opacity-50"
    >
      {working ? "Refining…" : "Refine estimate"}
    </button>
    {message ? <div className={`mt-1 text-[10px] font-bold ${message.includes("✓") ? "text-emerald-700" : "max-w-[220px] text-red-700"}`}>{message}</div> : null}
  </div>;
}
