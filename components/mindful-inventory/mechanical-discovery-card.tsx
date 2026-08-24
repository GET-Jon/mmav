"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  InventoryFindingSeverity,
  InventoryFindingView,
} from "@/lib/mindful-inventory/intake-inspection";

type Props = {
  vehicleId: string;
  finding: InventoryFindingView;
  disabled?: boolean;
};

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-500";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-xs font-black uppercase tracking-[0.08em] text-slate-500">
      {children}
    </div>
  );
}

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function severityLabel(severity: InventoryFindingSeverity | null) {
  if (!severity) return "Unrated";
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

export function MechanicalDiscoveryCard({
  vehicleId,
  finding,
  disabled = false,
}: Props) {
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [title, setTitle] = useState(finding.title);
  const [description, setDescription] = useState(finding.description || "");
  const [category, setCategory] = useState(finding.category || "mechanical");
  const [severity, setSeverity] = useState<
    InventoryFindingSeverity | ""
  >(finding.severity || "");
  const [costLow, setCostLow] = useState(
    finding.estimatedCostLow?.toString() || "",
  );
  const [costHigh, setCostHigh] = useState(
    finding.estimatedCostHigh?.toString() || "",
  );
  const [durationHours, setDurationHours] = useState(
    finding.estimatedDurationHours?.toString() || "",
  );

  function cancelEdit() {
    setTitle(finding.title);
    setDescription(finding.description || "");
    setCategory(finding.category || "mechanical");
    setSeverity(finding.severity || "");
    setCostLow(finding.estimatedCostLow?.toString() || "");
    setCostHigh(finding.estimatedCostHigh?.toString() || "");
    setDurationHours(finding.estimatedDurationHours?.toString() || "");
    setMessage("");
    setEditing(false);
  }

  async function saveFinding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicleId}/findings`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            findingId: finding.id,
            title,
            description,
            category,
            severity: severity || null,
            estimatedCostLow: costLow,
            estimatedCostHigh: costHigh,
            estimatedDurationHours: durationHours,
          }),
        },
      );

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(
          payload.error || "Failed to update mechanical discovery.",
        );
      }

      setEditing(false);
      setMessage("Discovery updated.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to update mechanical discovery.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="group rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <div className="font-black text-slate-800">{finding.title}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs font-bold text-slate-400">
            <span>{finding.category || "Other"}</span>
            <span>·</span>
            <span>{severityLabel(finding.severity)}</span>
            <span>·</span>
            <span>
              {money(finding.estimatedCostLow)}–
              {money(finding.estimatedCostHigh)}
            </span>
          </div>
        </div>

        <span className="shrink-0 text-sm font-black text-slate-400 transition group-open:rotate-180">
          ↓
        </span>
      </summary>

      <div className="border-t border-slate-100 px-4 py-4">
        {!editing ? (
          <>
            <div className="text-sm leading-6 text-slate-600">
              {finding.description || "No description."}
            </div>

            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs font-black uppercase tracking-wide text-slate-400">
                  Category
                </dt>
                <dd className="mt-1 font-semibold text-slate-700">
                  {finding.category || "Other"}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-black uppercase tracking-wide text-slate-400">
                  Severity
                </dt>
                <dd className="mt-1 font-semibold text-slate-700">
                  {severityLabel(finding.severity)}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-black uppercase tracking-wide text-slate-400">
                  Estimate
                </dt>
                <dd className="mt-1 font-semibold text-slate-700">
                  {money(finding.estimatedCostLow)}–
                  {money(finding.estimatedCostHigh)}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-black uppercase tracking-wide text-slate-400">
                  Est. Hours
                </dt>
                <dd className="mt-1 font-semibold text-slate-700">
                  {finding.estimatedDurationHours ?? "—"}
                </dd>
              </div>
            </dl>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-500">
                {message}
              </div>

              {!disabled ? (
                <button
                  type="button"
                  onClick={() => {
                    setMessage("");
                    setEditing(true);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
                >
                  Edit
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <form onSubmit={saveFinding} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="md:col-span-2">
              <FieldLabel>Finding</FieldLabel>
              <input
                required
                className={inputClass}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>

            <label>
              <FieldLabel>Category</FieldLabel>
              <select
                className={inputClass}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="mechanical">Mechanical</option>
                <option value="maintenance">Maintenance</option>
                <option value="cosmetic">Cosmetic</option>
                <option value="inspection">Inspection</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label>
              <FieldLabel>Severity</FieldLabel>
              <select
                className={inputClass}
                value={severity}
                onChange={(event) =>
                  setSeverity(
                    event.target.value as InventoryFindingSeverity | "",
                  )
                }
              >
                <option value="">Unrated</option>
                <option value="green">Green</option>
                <option value="yellow">Yellow</option>
                <option value="red">Red</option>
              </select>
            </label>

            <label className="md:col-span-2 xl:col-span-4">
              <FieldLabel>Description</FieldLabel>
              <textarea
                className={`${inputClass} min-h-20 resize-y`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <label>
              <FieldLabel>Est. Cost Low</FieldLabel>
              <input
                className={inputClass}
                inputMode="decimal"
                value={costLow}
                onChange={(event) => setCostLow(event.target.value)}
              />
            </label>

            <label>
              <FieldLabel>Est. Cost High</FieldLabel>
              <input
                className={inputClass}
                inputMode="decimal"
                value={costHigh}
                onChange={(event) => setCostHigh(event.target.value)}
              />
            </label>

            <label>
              <FieldLabel>Est. Hours</FieldLabel>
              <input
                className={inputClass}
                inputMode="decimal"
                value={durationHours}
                onChange={(event) => setDurationHours(event.target.value)}
              />
            </label>

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-300"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>

            {message ? (
              <div className="md:col-span-2 xl:col-span-4 text-sm font-semibold text-slate-600">
                {message}
              </div>
            ) : null}
          </form>
        )}
      </div>
    </details>
  );
}
