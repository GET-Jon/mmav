"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InventoryMechanicalNextStep({
  vehicleId,
  inspectionComplete,
}: {
  vehicleId: string;
  inspectionComplete: boolean;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");

  if (!inspectionComplete) return null;

  async function generateAndReview() {
    setGenerating(true);
    setMessage("Building Preliminary Work Plan…");

    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicleId}/work-plan/generate`,
        { method: "POST" },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to generate Preliminary Work Plan.");

      router.push(`/mindful/inventory/${vehicleId}/car-plan`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to generate Preliminary Work Plan.");
      setGenerating(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-300 bg-slate-950 p-5 text-white shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">Mechanical Complete</div>
          <h3 className="mt-1 text-lg font-black">Next: build the Preliminary Work Plan</h3>
          <p className="mt-1 max-w-3xl text-sm font-medium text-slate-300">
            Lot Logic will combine the original AI issues, Intake, requested upgrades, Mechanical assessment, and discoveries into a traceable proposed scope for owner review.
          </p>
          {message ? <div className="mt-3 text-sm font-bold text-slate-300">{message}</div> : null}
        </div>
        <button
          type="button"
          onClick={generateAndReview}
          disabled={generating}
          className="shrink-0 rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-60"
        >
          {generating ? "Building Work Plan…" : "Review Work Plan →"}
        </button>
      </div>
    </section>
  );
}
