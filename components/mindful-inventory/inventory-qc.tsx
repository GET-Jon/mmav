"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type {
  InventoryQcData,
  InventoryQcItemResult,
} from "@/lib/mindful-inventory/qc";

async function parseResponse(response: Response) {
  const text = await response.text();

  if (!text.trim()) {
    return {} as { error?: string; outcome?: string; phase?: string };
  }

  try {
    return JSON.parse(text) as {
      error?: string;
      outcome?: string;
      phase?: string;
    };
  } catch {
    throw new Error(
      `QC request failed (${response.status}). The server returned a non-JSON response.`,
    );
  }
}

function labelize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function InventoryQc({
  vehicleId,
  data,
}: {
  vehicleId: string;
  data: InventoryQcData;
}) {
  const router = useRouter();

  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState(data.inspection?.summary || "");

  const inspection = data.inspection;
  const completed = Boolean(inspection?.completedAt);

  async function startQc() {
    setWorkingId("start");
    setMessage("");

    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicleId}/qc`,
        {
          method: "POST",
        },
      );

      const payload = await parseResponse(response);

      if (!response.ok) {
        throw new Error(payload.error || "Failed to start Final QC.");
      }

      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to start Final QC.",
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function updateItem(
    itemId: string,
    result: InventoryQcItemResult,
  ) {
    setWorkingId(itemId);
    setMessage("");

    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicleId}/qc`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "update_item",
            itemId,
            result,
          }),
        },
      );

      const payload = await parseResponse(response);

      if (!response.ok) {
        throw new Error(payload.error || "Failed to update QC item.");
      }

      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to update QC item.",
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function completeQc() {
    setWorkingId("complete");
    setMessage("");

    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicleId}/qc`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "complete",
            summary,
          }),
        },
      );

      const payload = await parseResponse(response);

      if (!response.ok) {
        throw new Error(payload.error || "Failed to complete Final QC.");
      }

      if (payload.outcome === "pass") {
        setMessage("Final QC passed. Vehicle is Ready.");
      } else {
        setMessage("Final QC failed. Rework was created.");
      }

      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to complete Final QC.",
      );
    } finally {
      setWorkingId(null);
    }
  }

  if (!inspection) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">
          Release Gate
        </div>

        <h2 className="mt-1 text-2xl font-black text-slate-950">
          Final QC
        </h2>

        <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">
          Final QC is the last management gate before a vehicle is released
          as Ready. Failed items return the vehicle to Active Work.
        </p>

        <button
          type="button"
          disabled={workingId === "start"}
          onClick={startQc}
          className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
        >
          Start Final QC
        </button>

        {message ? (
          <div className="mt-4 text-sm font-bold text-rose-700">
            {message}
          </div>
        ) : null}
      </section>
    );
  }

  const passed = inspection.items.filter(
    (item) => item.result === "pass",
  ).length;

  const failed = inspection.items.filter(
    (item) => item.result === "fail",
  ).length;

  const unanswered = inspection.items.filter(
    (item) => !item.result,
  ).length;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">
              Release Gate
            </div>

            <h2 className="mt-1 text-2xl font-black text-slate-950">
              Final QC
            </h2>

            <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">
              Every checklist item must be resolved before the vehicle can
              leave the operational workflow.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-emerald-50 px-4 py-3">
              <div className="text-[10px] font-black uppercase text-emerald-600">
                Pass
              </div>
              <div className="mt-1 text-xl font-black text-emerald-900">
                {passed}
              </div>
            </div>

            <div className="rounded-xl bg-rose-50 px-4 py-3">
              <div className="text-[10px] font-black uppercase text-rose-600">
                Fail
              </div>
              <div className="mt-1 text-xl font-black text-rose-900">
                {failed}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <div className="text-[10px] font-black uppercase text-slate-500">
                Open
              </div>
              <div className="mt-1 text-xl font-black text-slate-900">
                {unanswered}
              </div>
            </div>
          </div>
        </div>

        {completed ? (
          <div
            className={`mt-5 rounded-xl px-4 py-3 text-sm font-black ${
              inspection.outcome === "pass"
                ? "bg-emerald-50 text-emerald-800"
                : "bg-rose-50 text-rose-800"
            }`}
          >
            QC {labelize(inspection.outcome || "complete")}
          </div>
        ) : null}

        {message ? (
          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
            {message}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        {inspection.items.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                  {labelize(item.category)}
                </div>

                <h3 className="mt-1 text-base font-black text-slate-950">
                  {item.label}
                </h3>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={completed || workingId === item.id}
                  onClick={() => updateItem(item.id, "pass")}
                  className={`rounded-xl px-4 py-2.5 text-sm font-black disabled:opacity-50 ${
                    item.result === "pass"
                      ? "bg-emerald-600 text-white"
                      : "border border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  Pass
                </button>

                <button
                  type="button"
                  disabled={completed || workingId === item.id}
                  onClick={() => updateItem(item.id, "fail")}
                  className={`rounded-xl px-4 py-2.5 text-sm font-black disabled:opacity-50 ${
                    item.result === "fail"
                      ? "bg-rose-600 text-white"
                      : "border border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  Fail
                </button>

                <button
                  type="button"
                  disabled={completed || workingId === item.id}
                  onClick={() => updateItem(item.id, "not_applicable")}
                  className={`rounded-xl px-4 py-2.5 text-sm font-black disabled:opacity-50 ${
                    item.result === "not_applicable"
                      ? "bg-slate-700 text-white"
                      : "border border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  N/A
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="text-sm font-black text-slate-800">
          QC Summary
          <textarea
            disabled={completed}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={4}
            placeholder="Final observations, test drive notes, or release comments..."
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-medium text-slate-700 disabled:bg-slate-50"
          />
        </label>

        {!completed ? (
          <div className="mt-5">
            <button
              type="button"
              disabled={workingId === "complete" || unanswered > 0}
              onClick={completeQc}
              className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Complete Final QC
            </button>

            {unanswered > 0 ? (
              <div className="mt-2 text-xs font-bold text-slate-500">
                Resolve all {unanswered} remaining checklist item
                {unanswered === 1 ? "" : "s"} first.
              </div>
            ) : null}
          </div>
        ) : inspection.outcome === "pass" ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="text-xs font-black uppercase tracking-[0.1em] text-emerald-700">
              Vehicle Ready
            </div>

            <h3 className="mt-1 text-xl font-black text-slate-950">
              Operational workflow complete
            </h3>

            <p className="mt-1 text-sm font-medium text-slate-600">
              The vehicle passed Final QC and is ready for merchandising and
              sale preparation.
            </p>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-5">
            <div className="text-xs font-black uppercase tracking-[0.1em] text-rose-700">
              QC Rework Required
            </div>

            <h3 className="mt-1 text-xl font-black text-slate-950">
              Vehicle returned to Active Work
            </h3>

            <p className="mt-1 text-sm font-medium text-slate-600">
              Failed QC items were converted into a rework Work Order.
            </p>

            <button
              type="button"
              onClick={() =>
                router.push(`/mindful/inventory/${vehicleId}/work`)
              }
              className="mt-4 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white"
            >
              Open Active Work →
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
