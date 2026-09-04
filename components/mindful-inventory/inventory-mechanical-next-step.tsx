"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function readResponseMessage(response: Response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { error?: string };
    return payload.error || null;
  }

  const text = await response.text();
  const plain = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return plain.slice(0, 300) || null;
}

export function InventoryMechanicalNextStep({
  vehicleId,
  inspectionComplete,
  planningReady,
}: {
  vehicleId: string;
  inspectionComplete: boolean;
  planningReady: boolean;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");

  if (!inspectionComplete) return null;

  async function generateAndReview() {
    if (!planningReady) {
      setMessage("Complete Overview / Intake before building the Work Plan.");
      return;
    }

    setGenerating(true);
    setMessage("Building Preliminary Work Plan…");

    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicleId}/work-plan/generate`,
        { method: "POST" },
      );

      if (!response.ok) {
        const serverMessage = await readResponseMessage(response);
        throw new Error(
          serverMessage ||
            `Failed to generate Preliminary Work Plan (${response.status}).`,
        );
      }

      router.push(`/mindful/inventory/${vehicleId}/car-plan`);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to generate Preliminary Work Plan.",
      );
      setGenerating(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-300 bg-slate-950 p-5 text-white shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">
            Mechanical Complete
          </div>
          <h3 className="mt-1 text-lg font-black">
            {planningReady
              ? "Next: build the Preliminary Work Plan"
              : "Work Plan blocked by incomplete Intake"}
          </h3>
          <p className="mt-1 max-w-3xl text-sm font-medium text-slate-300">
            {planningReady
              ? "Lot Logic will combine the original AI issues, Intake, requested upgrades, Mechanical assessment, and discoveries into a traceable proposed scope for owner review."
              : "Mechanical is complete, but Overview / Intake must also be marked complete before Lot Logic can build the Work Plan."}
          </p>
          {message ? (
            <div className="mt-3 text-sm font-bold text-slate-300">{message}</div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={generateAndReview}
          disabled={generating || !planningReady}
          className="shrink-0 rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating
            ? "Building Work Plan…"
            : planningReady
              ? "Review Work Plan →"
              : "Complete Intake First"}
        </button>
      </div>
    </section>
  );
}
