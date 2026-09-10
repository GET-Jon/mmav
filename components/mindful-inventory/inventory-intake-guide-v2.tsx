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
  const busy = useRef(false);
  const savedValues = useRef<Partial<Record<NumericFieldKey, string>>>({});
  const [fieldError, setFieldError] = useState<string | null>(null);
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
        if (savedValues.current[definition.key] === undefined) {
          savedValues.current[definition.key] = numericText(valueElement.textContent || "");
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
        titleSelect.style.appearance = "auto";
        titleSelect.style.paddingRight = "0.25rem";
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
    if (titleSelect) titleSelect.disabled = Boolean(confirmations.title_status) || savingField !== null;
    const cards = [
      ...numericTargets.filter((target) => target.required).map((target) => ({ key: target.key, element: target.element })),
      { key: "title_status", element: findCard("Title Status") },
    ];
    cards.forEach(({ key, element }) => {
      if (!element) return;
      element.dataset.intakeVerification = savingField === key ? "saving"
        : fieldError === key ? "error"
        : confirmations[key] ? "confirmed"
        : activeKey === key ? "active" : "waiting";
    });
  }, [confirmations, savingField, activeKey, numericTargets, fieldError]);

  async function runFieldAction(key: string, action: () => Promise<void>) {
    // A ref prevents a second click before React has rendered the disabled button.
    if (busy.current) return;
    busy.current = true;
    setSavingField(key);
    setFieldError(null);
    setStatusMessage("");
    try {
      await action();
    } catch (error) {
      setFieldError(key);
      setStatusMessage(error instanceof Error ? error.message : "Could not save. Please try again.");
    } finally {
      busy.current = false;
      setSavingField(null);
    }
  }

  async function saveSummary(field: string, value: string) {
    const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/intake/summary-field`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, value }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) throw new Error(payload.error || "Failed to save Intake value. Please try again.");
  }

  async function saveNumeric(key: NumericFieldKey, nextValue: string) {
    const clean = numericText(nextValue);
    if (!clean || !Number.isFinite(Number(clean))) throw new Error("Enter a valid number before confirming.");
    // Confirming an unchanged value should not write a duplicate correction first.
    if (Number(savedValues.current[key]) !== Number(clean)) {
      await saveSummary(key, clean);
      savedValues.current[key] = clean;
    }
    setValues((previous) => ({ ...previous, [key]: displayNumber(key, clean) }));
  }

  async function setConfirmed(key: RequiredKey, confirmed: boolean, value?: string) {
    const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/intake/confirmations`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, confirmed, value: value ?? null }),
    });
    const payload = await response.json() as {
      error?: string;
      fieldConfirmations?: Record<string, IntakeFieldConfirmation>;
    };
    if (!response.ok || !payload.fieldConfirmations) {
      throw new Error(payload.error || "Failed to update Intake confirmation. Please try again.");
    }
    setConfirmations(payload.fieldConfirmations);
    setStatusMessage(confirmed ? "Confirmed." : "Field reopened for editing.");
  }

  async function confirmNumeric(target: NumericTarget) {
    if (!confirmations[target.key] && target.key !== activeKey) return;
    await runFieldAction(target.key, async () => {
      if (confirmations[target.key]) {
        await setConfirmed(target.key as RequiredKey, false);
        return;
      }
      await saveNumeric(target.key, values[target.key]);
      await setConfirmed(target.key as RequiredKey, true, displayNumber(target.key, values[target.key]));
    });
  }

  async function confirmTitle() {
    const select = findCard("Title Status")?.querySelector<HTMLSelectElement>("select");
    if (!select || (!confirmations.title_status && activeKey !== "title_status")) return;
    await runFieldAction("title_status", async () => {
      if (confirmations.title_status) {
        await setConfirmed("title_status", false);
        return;
      }
      // Persist the selected title value before marking it verified. Do not fire
      // a hidden full-form save and race its response against confirmation.
      await saveSummary("title_status", select.value);
      await setConfirmed("title_status", true, select.options[select.selectedIndex]?.text || select.value);
    });
  }

  function proceed() {
    if (!allConfirmed || busy.current) return;
    const button = findActionButton("Proceed to Mechanical");
    if (!button) {
      setStatusMessage("Could not find the Mechanical transition. Refresh and try again.");
      return;
    }
    button.click();
  }

  return (
    <>
      <style>{`
        [data-intake-verification] { border-color: #e2e8f0 !important; background: white !important; box-shadow: none !important; }
        [data-intake-verification="active"] { border-color: #fbbf24 !important; background: #fffbeb !important; box-shadow: 0 0 0 1px #fbbf24 !important; }
        [data-intake-verification="saving"] { border-color: #60a5fa !important; background: #eff6ff !important; box-shadow: 0 0 0 1px #60a5fa !important; }
        [data-intake-verification="confirmed"] { border-color: #a7f3d0 !important; }
        [data-intake-verification="error"] { border-color: #f87171 !important; background: #fef2f2 !important; }
      `}</style>
      {numericTargets.map((target) => {
        const confirmed = target.required ? Boolean(confirmations[target.key]) : false;
        const active = target.required && target.key === activeKey;
        return createPortal(
          <div className="absolute inset-x-3 top-7 flex items-center gap-2" key={target.key}>
            <input
              aria-label={target.label}
              inputMode={target.key === "purchase_mileage" ? "numeric" : "decimal"}
              disabled={confirmed || savingField !== null}
              value={values[target.key]}
              onFocus={(event) => {
                if (!confirmed) event.currentTarget.value = numericText(values[target.key]);
              }}
              onChange={(event) => setValues((previous) => ({ ...previous, [target.key]: event.target.value }))}
              onBlur={() => {
                // Required values save with their confirmation, avoiding blur/click races.
                if (!target.required && !confirmed) void runFieldAction(target.key, () => saveNumeric(target.key, values[target.key]));
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
                disabled={savingField !== null || (!confirmed && !active)}
                aria-busy={savingField === target.key}
                aria-label={savingField === target.key ? `Saving ${target.label}` : confirmed ? `Edit ${target.label}` : `Confirm ${target.label}`}
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black transition ${
                  confirmed
                    ? "bg-emerald-600 text-white"
                    : active
                      ? "border-2 border-emerald-500 bg-white text-emerald-700"
                      : "border border-slate-200 bg-white text-slate-300"
                }`}
              >
                {savingField === target.key ? <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" /> : confirmed ? "✓" : "→"}
              </button>
            ) : null}
            {savingField === target.key || fieldError === target.key ? <span role="status" className={`absolute left-0 top-full mt-0.5 text-[10px] font-bold ${fieldError === target.key ? "text-red-700" : "text-blue-700"}`}>{fieldError === target.key ? "Not saved · retry" : "Saving…"}</span> : null}
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
          <button
            type="button"
            title={confirmed ? "Confirmed — click to edit" : active ? "Confirm this status" : "Confirm prior item first"}
            onClick={() => void confirmTitle()}
            disabled={savingField !== null || (!confirmed && !active)}
            aria-busy={savingField === "title_status"}
            aria-label={savingField === "title_status" ? "Saving Title Status" : confirmed ? "Edit Title Status" : "Confirm Title Status"}
            className={`absolute right-3 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-xs font-black transition ${
              confirmed
                ? "bg-emerald-600 text-white"
                : active
                  ? "border-2 border-emerald-500 bg-white text-emerald-700"
                  : "border border-slate-200 bg-white text-slate-300"
            }`}
          >
            {savingField === "title_status" ? <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" /> : confirmed ? "✓" : "→"}
          </button>
          {savingField === "title_status" || fieldError === "title_status" ? <span role="status" className={`absolute bottom-1 left-4 text-[10px] font-bold ${fieldError === "title_status" ? "text-red-700" : "text-blue-700"}`}>{fieldError === "title_status" ? "Not saved · retry" : "Saving…"}</span> : null}
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
            {statusMessage ? <div role={fieldError ? "alert" : "status"} className={`mt-2 text-sm font-bold ${fieldError ? "text-red-700" : "text-slate-700"}`}>{statusMessage}</div> : null}
          </div>
          <button
            type="button"
            onClick={proceed}
            disabled={!allConfirmed || savingField !== null}
            className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Proceed to Mechanical →
          </button>
        </div>
      </section>
    </>
  );
}
