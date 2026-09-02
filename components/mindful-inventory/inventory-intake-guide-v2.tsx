"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { IntakeFieldConfirmation } from "@/lib/mindful-inventory/intake-inspection";

type Props = {
  vehicleId: string;
  initialConfirmations: Record<string, IntakeFieldConfirmation>;
};

type NumericFieldKey =
  | "purchase_mileage"
  | "purchase_price"
  | "buyer_fees"
  | "transport_cost"
  | "other_acquisition";

type RequiredKey = "purchase_mileage" | "title_status" | "purchase_price";

type NumericTarget = {
  key: NumericFieldKey;
  label: string;
  required: boolean;
  element: HTMLElement;
  valueElement: HTMLElement;
};

const numericDefinitions: Array<{ key: NumericFieldKey; label: string; required: boolean }> = [
  { key: "purchase_mileage", label: "Mileage", required: true },
  { key: "purchase_price", label: "Purchase", required: true },
  { key: "buyer_fees", label: "Buyer Fees", required: false },
  { key: "transport_cost", label: "Transport", required: false },
  { key: "other_acquisition", label: "Other Acquisition", required: false },
];

const requiredOrder: RequiredKey[] = ["purchase_mileage", "title_status", "purchase_price"];

function findExactText(text: string) {
  return (
    Array.from(document.querySelectorAll<HTMLElement>("div,dt,label,h2,h3"))
      .find((element) => element.textContent?.trim() === text) || null
  );
}

function findCard(label: string) {
  return findExactText(label)?.closest<HTMLElement>(".rounded-xl") || null;
}

function findActionButton(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === label || button.textContent?.includes(label),
  );
}

function hideTopActionTile() {
  const heading = findExactText("What we know about this car");
  const section = heading?.closest<HTMLElement>("section");
  if (section) section.style.display = "none";
}

function renameProjectedRecon() {
  const currentRecon = findExactText("Current Recon");
  if (!currentRecon) return;
  currentRecon.textContent = "Projected Recon";
  const card = currentRecon.closest<HTMLElement>(".rounded-xl");
  const sub = card?.querySelectorAll<HTMLElement>("div")[2];
  if (sub) sub.textContent = "open findings + proposed upgrades";
}

function numericText(value: string) {
  return value.replace(/[^0-9.]/g, "");
}

function displayNumber(key: NumericFieldKey, value: string) {
  const parsed = Number(numericText(value));
  if (!Number.isFinite(parsed)) return value;
  if (key === "purchase_mileage") return Math.round(parsed).toLocaleString("en-US");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(parsed);
}

function autosaveControls() {
  const labels = [
    "Title Status",
    "Assign Owner",
    "Mileage Received",
    "Keys",
    "Preliminary Grade",
    "Visible Damage / Differences From Listing",
    "Additional Intake Notes",
  ];

  const controls: Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> = [];
  labels.forEach((label) => {
    const text = findExactText(label);
    const root = text?.closest("label") || text?.parentElement;
    const control = root?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input,select,textarea",
    );
    if (control) controls.push(control);
  });
  return controls;
}

export function InventoryIntakeGuideV2({ vehicleId, initialConfirmations }: Props) {
  const [confirmations, setConfirmations] = useState(initialConfirmations);
  const [numericTargets, setNumericTargets] = useState<NumericTarget[]>([]);
  const [values, setValues] = useState<Record<NumericFieldKey, string>>({
    purchase_mileage: "",
    purchase_price: "",
    buyer_fees: "",
    transport_cost: "",
    other_acquisition: "",
  });
  const [savingField, setSavingField] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const autosaveTimer = useRef<number | null>(null);

  useEffect(() => {
    hideTopActionTile();
    renameProjectedRecon();

    const discover = () => {
      const found: NumericTarget[] = [];
      const nextValues = { ...values };

      numericDefinitions.forEach((definition) => {
        const card = findCard(definition.label);
        if (!card) return;
        const divs = Array.from(card.children).filter((node): node is HTMLElement => node instanceof HTMLElement);
        const valueElement = divs[1];
        if (!valueElement) return;
        if (!nextValues[definition.key]) {
          nextValues[definition.key] = displayNumber(definition.key, valueElement.textContent || "");
        }
        valueElement.style.visibility = "hidden";
        card.classList.add("relative");
        found.push({ ...definition, element: card, valueElement });
      });

      setValues((previous) => {
        const merged = { ...previous };
        for (const key of Object.keys(nextValues) as NumericFieldKey[]) {
          if (!merged[key]) merged[key] = nextValues[key];
        }
        return merged;
      });
      setNumericTargets((previous) => {
        const same =
          previous.length === found.length &&
          previous.every((target, index) => target.key === found[index]?.key && target.element === found[index]?.element);
        return same ? previous : found;
      });

      const titleCard = findCard("Title Status");
      titleCard?.classList.add("relative");
      const titleSelect = titleCard?.querySelector<HTMLSelectElement>("select");
      if (titleSelect) {
        titleSelect.style.appearance = "none";
        titleSelect.style.paddingRight = "4.5rem";
      }
    };

    discover();
    const timer = window.setTimeout(discover, 200);
    const observer = new MutationObserver(() => {
      hideTopActionTile();
      renameProjectedRecon();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const saveButton = findActionButton("Save");
    const controls = autosaveControls();
    const queueAutosave = () => {
      if (!saveButton) return;
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = window.setTimeout(() => saveButton.click(), 650);
    };
    controls.forEach((control) => {
      control.addEventListener("input", queueAutosave);
      control.addEventListener("change", queueAutosave);
    });
    window.setTimeout(() => saveButton?.click(), 100);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
      controls.forEach((control) => {
        control.removeEventListener("input", queueAutosave);
        control.removeEventListener("change", queueAutosave);
      });
    };
    // DOM discovery intentionally runs once for this page instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeKey = useMemo(
    () => requiredOrder.find((key) => !confirmations[key]) || null,
    [confirmations],
  );
  const confirmedCount = requiredOrder.filter((key) => confirmations[key]).length;
  const allConfirmed = confirmedCount === requiredOrder.length;

  useEffect(() => {
    const titleSelect = findCard("Title Status")?.querySelector<HTMLSelectElement>("select");
    if (titleSelect) titleSelect.disabled = Boolean(confirmations.title_status);
  }, [confirmations]);

  async function saveNumeric(key: NumericFieldKey, nextValue: string) {
    const clean = numericText(nextValue);
    if (!clean) return false;
    setSavingField(key);
    setStatusMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/intake/summary-field`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: key, value: clean }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to save Intake value.");
      setValues((previous) => ({ ...previous, [key]: displayNumber(key, clean) }));
      return true;
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to save Intake value.");
      return false;
    } finally {
      setSavingField(null);
    }
  }

  async function setConfirmed(key: RequiredKey, confirmed: boolean, value?: string) {
    setSavingField(key);
    setStatusMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/intake/confirmations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, confirmed, value: value ?? null }),
      });
      const payload = (await response.json()) as {
        error?: string;
        fieldConfirmations?: Record<string, IntakeFieldConfirmation>;
      };
      if (!response.ok) throw new Error(payload.error || "Failed to update Intake confirmation.");
      setConfirmations(payload.fieldConfirmations || {});
      setStatusMessage(confirmed ? "Confirmed." : "Field reopened for editing.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to update Intake confirmation.");
    } finally {
      setSavingField(null);
    }
  }

  async function confirmNumeric(target: NumericTarget) {
    if (confirmations[target.key]) {
      await setConfirmed(target.key as RequiredKey, false);
      return;
    }
    if (target.key !== activeKey) return;
    const saved = await saveNumeric(target.key, values[target.key]);
    if (!saved) return;
    await setConfirmed(target.key as RequiredKey, true, displayNumber(target.key, values[target.key]));
  }

  async function confirmTitle() {
    const select = findCard("Title Status")?.querySelector<HTMLSelectElement>("select");
    if (!select) return;
    if (confirmations.title_status) {
      await setConfirmed("title_status", false);
      return;
    }
    if (activeKey !== "title_status") return;
    findActionButton("Save")?.click();
    await setConfirmed("title_status", true, select.options[select.selectedIndex]?.text || select.value);
  }

  function proceed() {
    if (!allConfirmed) return;
    const button = findActionButton("Proceed to Mechanical");
    if (!button) {
      setStatusMessage("Could not find the Mechanical transition. Refresh and try again.");
      return;
    }
    button.click();
  }

  return (
    <>
      {numericTargets.map((target) => {
        const confirmed = target.required ? Boolean(confirmations[target.key]) : false;
        const active = target.required && target.key === activeKey;
        return createPortal(
          <div className="absolute inset-x-3 top-7 flex items-center gap-2" key={target.key}>
            <input
              aria-label={target.label}
              inputMode={target.key === "purchase_mileage" ? "numeric" : "decimal"}
              disabled={confirmed || savingField === target.key}
              value={values[target.key]}
              onFocus={(event) => {
                if (!confirmed) event.currentTarget.value = numericText(values[target.key]);
              }}
              onChange={(event) => setValues((previous) => ({ ...previous, [target.key]: event.target.value }))}
              onBlur={() => {
                if (!confirmed) void saveNumeric(target.key, values[target.key]);
              }}
              className={`min-w-0 flex-1 rounded-md border bg-transparent px-1.5 py-1 text-base font-black outline-none transition ${
                confirmed
                  ? "border-transparent text-slate-950"
                  : active
                    ? "border-emerald-400 bg-emerald-50/60 text-slate-950 focus:border-emerald-500"
                    : "border-transparent text-slate-950 hover:border-slate-200 focus:border-slate-300"
              }`}
            />
            {target.required ? (
              <button
                type="button"
                title={confirmed ? "Confirmed — click to edit" : active ? "Confirm this value" : "Confirm prior item first"}
                onClick={() => void confirmNumeric(target)}
                disabled={savingField === target.key || (!confirmed && !active)}
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black transition ${
                  confirmed
                    ? "bg-emerald-600 text-white"
                    : active
                      ? "border-2 border-emerald-500 bg-white text-emerald-700"
                      : "border border-slate-200 bg-white text-slate-300"
                }`}
              >
                {confirmed ? "✓" : "→"}
              </button>
            ) : null}
          </div>,
          target.element,
        );
      })}

      {(() => {
        const titleCard = findCard("Title Status");
        if (!titleCard) return null;
        const confirmed = Boolean(confirmations.title_status);
        const active = activeKey === "title_status";
        return createPortal(
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-11 top-2 z-10 grid h-7 w-7 place-items-center text-base font-black text-slate-700"
            >
              ▾
            </span>
            <button
              type="button"
              title={confirmed ? "Confirmed — click to edit" : active ? "Confirm this status" : "Confirm prior item first"}
              onClick={() => void confirmTitle()}
              disabled={savingField === "title_status" || (!confirmed && !active)}
              className={`absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full text-xs font-black transition ${
                confirmed
                  ? "bg-emerald-600 text-white"
                  : active
                    ? "border-2 border-emerald-500 bg-white text-emerald-700"
                    : "border border-slate-200 bg-white text-slate-300"
              }`}
            >
              {confirmed ? "✓" : "→"}
            </button>
          </>,
          titleCard,
        );
      })()}

      <section className={`mt-5 rounded-2xl border p-5 shadow-sm ${allConfirmed ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className={`text-xs font-black uppercase tracking-[0.1em] ${allConfirmed ? "text-emerald-700" : "text-slate-400"}`}>
              Intake verification
            </div>
            <div className="mt-1 text-base font-black text-slate-950">
              {allConfirmed ? "Intake verified." : `${confirmedCount} of ${requiredOrder.length} required items confirmed`}
            </div>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {allConfirmed
                ? "Mileage, title status, and purchase price have been verified."
                : "Confirm mileage, title status, and purchase price before moving to Mechanical."}
            </p>
            {statusMessage ? <div className="mt-2 text-sm font-bold text-slate-700">{statusMessage}</div> : null}
          </div>
          <button
            type="button"
            onClick={proceed}
            disabled={!allConfirmed}
            className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Proceed to Mechanical →
          </button>
        </div>
      </section>
    </>
  );
}
