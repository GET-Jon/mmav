"use client";

import { useEffect, useState } from "react";

import { InventoryWorkItems } from "@/components/mindful-inventory/inventory-work-items";
import type { InventoryVehicleView } from "@/lib/mindful-inventory/queries";

type InventoryVehicleDrawerProps = {
  vehicle: InventoryVehicleView | null;
  onClose: () => void;
  onSaved: () => void;
};

const stageOptions = [
  ["purchased", "Purchased"],
  ["awaiting_transport", "Awaiting Transport"],
  ["received", "Received"],
  ["inspection", "Inspection"],
  ["work_scoping", "Work Scoping"],
  ["parts_ordered", "Parts Ordered"],
  ["in_service", "In Service"],
  ["awaiting_detail", "Awaiting Detail"],
  ["ready_for_sale", "Ready for Sale"],
  ["listed", "Listed"],
  ["sale_pending", "Sale Pending"],
  ["sold", "Sold"],
  ["blocked", "Blocked"],
] as const;

const titleOptions = [
  ["unknown", "Unknown"],
  ["awaiting", "Awaiting"],
  ["received", "Received"],
  ["issue", "Issue"],
  ["not_applicable", "Not Applicable"],
] as const;

function inputClass() {
  return "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-950 shadow-sm outline-none transition focus:border-slate-400";
}

function labelClass() {
  return "block text-xs font-black uppercase tracking-[0.08em] text-slate-500";
}

function money(value: number | null) {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function InventoryVehicleDrawer({
  vehicle,
  onClose,
  onSaved,
}: InventoryVehicleDrawerProps) {
  if (!vehicle) {
    return null;
  }

  return (
    <InventoryVehicleDrawerContent
      key={vehicle.id}
      vehicle={vehicle}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function InventoryVehicleDrawerContent({
  vehicle,
  onClose,
  onSaved,
}: {
  vehicle: InventoryVehicleView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(() => ({
    purchasePrice: String(vehicle.purchasePrice),
    buyerFees: String(vehicle.buyerFees),
    transportCost: String(vehicle.transportCost),
    otherAcquisitionCost: String(
      vehicle.otherAcquisitionCost,
    ),
    stage: vehicle.stage,
    currentLocation: vehicle.currentLocation || "",
    titleStatus: vehicle.titleStatus,
    targetReadyDate: vehicle.targetReadyDate || "",
    expectedSalePrice:
      vehicle.expectedSalePrice === null
        ? ""
        : String(vehicle.expectedSalePrice),
    nextAction: vehicle.nextAction || "",
    nextActionOwner: vehicle.nextActionOwner || "",
    nextActionDueDate: vehicle.nextActionDueDate || "",
    notes: vehicle.notes || "",
  }));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!vehicle) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [vehicle, saving, onClose]);

  const vehicleName = [
    vehicle.year,
    vehicle.make,
    vehicle.model,
    vehicle.trim,
  ]
    .filter(Boolean)
    .join(" ");

  function updateField(
    key: keyof typeof form,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function saveVehicle() {
    if (!vehicle) {
      return;
    }

    const vehicleId = vehicle.id;

    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicleId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Inventory update failed.",
        );
      }

      onSaved();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Inventory update failed.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] bg-slate-950/35"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !saving
        ) {
          onClose();
        }
      }}
    >
      <aside className="ml-auto flex h-full w-full max-w-2xl flex-col bg-[#f7f8fb] shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              Inventory vehicle
            </div>

            <h2 className="mt-1 text-2xl font-black tracking-[-0.035em] text-slate-950">
              {vehicleName}
            </h2>

            <div className="mt-1 text-sm font-semibold text-slate-500">
              {vehicle.stockNumber
                ? `Stock # ${vehicle.stockNumber}`
                : vehicle.vin || "No VIN recorded"}
            </div>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-xl font-bold text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
            aria-label="Close vehicle details"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-black text-slate-950">
              Financial overview
            </h3>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <div className="text-xs font-bold text-slate-500">
                  Invested
                </div>
                <div className="mt-1 text-lg font-black text-slate-950">
                  {money(
                    vehicle.financials.actualInvestedToDate,
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs font-bold text-slate-500">
                  Remaining
                </div>
                <div className="mt-1 text-lg font-black text-slate-950">
                  {money(
                    vehicle.financials.outstandingWorkCost,
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs font-bold text-slate-500">
                  Projected all-in
                </div>
                <div className="mt-1 text-lg font-black text-slate-950">
                  {money(
                    vehicle.financials.projectedAllInCost,
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs font-bold text-slate-500">
                  Projected profit
                </div>
                <div className="mt-1 text-lg font-black text-emerald-700">
                  {money(
                    vehicle.financials.projectedGrossProfit,
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-black text-slate-950">
              Acquisition
            </h3>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className={labelClass()}>
                Purchase price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.purchasePrice}
                  onChange={(event) =>
                    updateField(
                      "purchasePrice",
                      event.target.value,
                    )
                  }
                  className={inputClass()}
                />
              </label>

              <label className={labelClass()}>
                Buyer fees
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.buyerFees}
                  onChange={(event) =>
                    updateField(
                      "buyerFees",
                      event.target.value,
                    )
                  }
                  className={inputClass()}
                />
              </label>

              <label className={labelClass()}>
                Transport
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.transportCost}
                  onChange={(event) =>
                    updateField(
                      "transportCost",
                      event.target.value,
                    )
                  }
                  className={inputClass()}
                />
              </label>

              <label className={labelClass()}>
                Other acquisition costs
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.otherAcquisitionCost}
                  onChange={(event) =>
                    updateField(
                      "otherAcquisitionCost",
                      event.target.value,
                    )
                  }
                  className={inputClass()}
                />
              </label>

              <label className={labelClass()}>
                Expected sale price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.expectedSalePrice}
                  onChange={(event) =>
                    updateField(
                      "expectedSalePrice",
                      event.target.value,
                    )
                  }
                  className={inputClass()}
                />
              </label>

              <label className={labelClass()}>
                Target ready date
                <input
                  type="date"
                  value={form.targetReadyDate}
                  onChange={(event) =>
                    updateField(
                      "targetReadyDate",
                      event.target.value,
                    )
                  }
                  className={inputClass()}
                />
              </label>
            </div>
          </section>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-black text-slate-950">
              Operations
            </h3>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className={labelClass()}>
                Stage
                <select
                  value={form.stage}
                  onChange={(event) =>
                    updateField("stage", event.target.value)
                  }
                  className={inputClass()}
                >
                  {stageOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={labelClass()}>
                Current location
                <input
                  value={form.currentLocation}
                  onChange={(event) =>
                    updateField(
                      "currentLocation",
                      event.target.value,
                    )
                  }
                  className={inputClass()}
                  placeholder="Mindful lot, shop, transporter..."
                />
              </label>

              <label className={labelClass()}>
                Title status
                <select
                  value={form.titleStatus}
                  onChange={(event) =>
                    updateField(
                      "titleStatus",
                      event.target.value,
                    )
                  }
                  className={inputClass()}
                >
                  {titleOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={labelClass()}>
                Next action owner
                <input
                  value={form.nextActionOwner}
                  onChange={(event) =>
                    updateField(
                      "nextActionOwner",
                      event.target.value,
                    )
                  }
                  className={inputClass()}
                  placeholder="Jon"
                />
              </label>

              <label className={`sm:col-span-2 ${labelClass()}`}>
                Next action
                <input
                  value={form.nextAction}
                  onChange={(event) =>
                    updateField(
                      "nextAction",
                      event.target.value,
                    )
                  }
                  className={inputClass()}
                  placeholder="Schedule inspection"
                />
              </label>

              <label className={labelClass()}>
                Next action due
                <input
                  type="date"
                  value={form.nextActionDueDate}
                  onChange={(event) =>
                    updateField(
                      "nextActionDueDate",
                      event.target.value,
                    )
                  }
                  className={inputClass()}
                />
              </label>
            </div>

            <label className={`mt-4 ${labelClass()}`}>
              Notes
              <textarea
                rows={5}
                value={form.notes}
                onChange={(event) =>
                  updateField("notes", event.target.value)
                }
                className={inputClass()}
                placeholder="Internal vehicle notes..."
              />
            </label>
          </section>

          <InventoryWorkItems
            vehicleId={vehicle.id}
            workItems={vehicle.workItems}
            onChanged={onSaved}
          />

          {vehicle.sourceEvaluationId ? (
            <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Imported as a one-time snapshot from Lot Logic.
              Changes made here do not update the original
              evaluation.
            </section>
          ) : null}

          {error ? (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => void saveVehicle()}
            className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-extrabold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Vehicle"}
          </button>
        </div>
      </aside>
    </div>
  );
}
