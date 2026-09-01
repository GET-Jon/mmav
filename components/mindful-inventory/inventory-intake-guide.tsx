"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import type { IntakeFieldConfirmation } from "@/lib/mindful-inventory/intake-inspection";

type Props = {
  vehicleId: string;
  initialConfirmations: Record<string, IntakeFieldConfirmation>;
};

const verificationOrder = [
  { key: "purchase_mileage", label: "Mileage", editable: true },
  { key: "title_status", label: "Title Status", editable: false },
  { key: "vehicle_owner", label: "Vehicle Owner", editable: false },
  { key: "purchase_price", label: "Purchase", editable: true },
  { key: "buyer_fees", label: "Buyer Fees", editable: true },
  { key: "transport_cost", label: "Transport", editable: true },
  { key: "other_acquisition", label: "Other Acquisition", editable: true },
] as const;

type VerificationDefinition = (typeof verificationOrder)[number];
type VerificationKey = VerificationDefinition["key"];

type VerifyTarget = VerificationDefinition & {
  element: HTMLElement;
};

type EditorState = {
  key: VerificationKey;
  label: string;
  value: string;
} | null;

function findExactText(text: string) {
  return (
    Array.from(document.querySelectorAll<HTMLElement>("div,dt,label,h2,h3"))
      .find((element) => element.textContent?.trim() === text) || null
  );
}

function findVerificationCard(label: string) {
  const text = findExactText(label);
  if (!text) return null;

  if (label === "Vehicle Owner") {
    return text.closest<HTMLElement>(".rounded-2xl");
  }

  return text.closest<HTMLElement>(".rounded-xl");
}

function currentValue(target: VerifyTarget) {
  const select = target.element.querySelector<HTMLSelectElement>("select");
  if (select) return select.options[select.selectedIndex]?.text || select.value;

  const input = target.element.querySelector<HTMLInputElement>("input");
  if (input) return input.value;

  const lines = (target.element.innerText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        line !== target.label &&
        line !== "Edit" &&
        line !== "Confirmed" &&
        !line.includes("Confirm this value") &&
        !line.includes("Review after prior items"),
    );

  return lines[0] || "";
}

function numericEditorValue(value: string) {
  return value.replace(/[^0-9.]/g, "");
}

function findActionButton(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === label || button.textContent?.includes(label),
  );
}

function hideTopActionTile() {
  const heading = findExactText("What we know about this car");
  const actionSection = heading?.closest<HTMLElement>("section");
  if (actionSection) actionSection.style.display = "none";
}

function renameProjectedRecon() {
  const currentRecon = findExactText("Current Recon");
  if (!currentRecon) return;
  currentRecon.textContent = "Projected Recon";
  const card = currentRecon.closest<HTMLElement>(".rounded-xl");
  const sub = card?.querySelectorAll<HTMLElement>("div")[2];
  if (sub) sub.textContent = "open findings + proposed upgrades";
}

function formatMileageField() {
  const mileageLabel = findExactText("Mileage Received");
  const input = mileageLabel?.closest("label")?.querySelector<HTMLInputElement>("input");
  if (!input) return () => undefined;

  const format = () => {
    const digits = input.value.replace(/[^0-9]/g, "");
    if (!digits) return;
    const formatted = Number(digits).toLocaleString("en-US");
    if (formatted === input.value) return;
    input.value = formatted;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  format();
  input.addEventListener("blur", format);
  return () => input.removeEventListener("blur", format);
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

export function InventoryIntakeGuide({ vehicleId, initialConfirmations }: Props) {
  const router = useRouter();
  const [confirmations, setConfirmations] = useState(initialConfirmations);
  const [targets, setTargets] = useState<VerifyTarget[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [editor, setEditor] = useState<EditorState>(null);
  const [editorValue, setEditorValue] = useState("");
  const [editorSaving, setEditorSaving] = useState(false);
  const autosaveTimer = useRef<number | null>(null);

  useEffect(() => {
    hideTopActionTile();
    renameProjectedRecon();
    const cleanupMileage = formatMileageField();

    const discover = () => {
      const next = verificationOrder
        .map((definition) => {
          const element = findVerificationCard(definition.label);
          return element ? { ...definition, element } : null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
      setTargets(next);
    };

    discover();
    const timer = window.setTimeout(discover, 250);
    const observer = new MutationObserver(() => {
      hideTopActionTile();
      renameProjectedRecon();
      discover();
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

    // Initialize the Intake record automatically; the page no longer exposes a manual Save action.
    window.setTimeout(() => saveButton?.click(), 100);

    return () => {
      window.clearTimeout(timer);
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
      observer.disconnect();
      cleanupMileage();
      controls.forEach((control) => {
        control.removeEventListener("input", queueAutosave);
        control.removeEventListener("change", queueAutosave);
      });
    };
  }, []);

  const activeKey = useMemo(
    () => targets.find((target) => !confirmations[target.key])?.key || null,
    [targets, confirmations],
  );

  const requiredCount = verificationOrder.length;
  const confirmedCount = verificationOrder.filter((item) => confirmations[item.key]).length;
  const allConfirmed = confirmedCount === requiredCount;

  useEffect(() => {
    targets.forEach((target) => {
      target.element.classList.add("relative");
      target.element.classList.toggle("ring-2", target.key === activeKey);
      target.element.classList.toggle("ring-emerald-400", target.key === activeKey);
      target.element.classList.toggle("ring-offset-1", target.key === activeKey);
    });

    return () => {
      targets.forEach((target) => {
        target.element.classList.remove("ring-2", "ring-emerald-400", "ring-offset-1");
      });
    };
  }, [targets, activeKey]);

  useEffect(() => {
    const cleanups = targets.map((target) => {
      const editable = target.element.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
      if (!editable) return () => undefined;

      const reopen = () => {
        if (!confirmations[target.key]) return;
        setConfirmations((previous) => {
          const next = { ...previous };
          delete next[target.key];
          return next;
        });
        void fetch(`/api/mindful/inventory/vehicles/${vehicleId}/intake/confirmations`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: target.key, confirmed: false }),
        });
      };

      editable.addEventListener("change", reopen);
      return () => editable.removeEventListener("change", reopen);
    });

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [targets, confirmations, vehicleId]);

  async function confirm(target: VerifyTarget) {
    if (!confirmations[target.key] && target.key !== activeKey) return;

    setSavingKey(target.key);
    setStatusMessage("");
    try {
      const value = currentValue(target);
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/intake/confirmations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: target.key, confirmed: true, value }),
      });
      const payload = (await response.json()) as {
        error?: string;
        fieldConfirmations?: Record<string, IntakeFieldConfirmation>;
      };
      if (!response.ok) throw new Error(payload.error || "Failed to confirm Intake field.");
      setConfirmations(payload.fieldConfirmations || {});
      setStatusMessage(`${target.label} confirmed.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to confirm Intake field.");
    } finally {
      setSavingKey(null);
    }
  }

  function openEditor(target: VerifyTarget) {
    const value = numericEditorValue(currentValue(target));
    setEditor({ key: target.key, label: target.label, value });
    setEditorValue(value);
    setStatusMessage("");
  }

  async function saveEditor() {
    if (!editor) return;
    setEditorSaving(true);
    setStatusMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/intake/summary-field`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: editor.key, value: editorValue }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || `Failed to update ${editor.label}.`);

      await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/intake/confirmations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: editor.key, confirmed: false }),
      });

      setConfirmations((previous) => {
        const next = { ...previous };
        delete next[editor.key];
        return next;
      });
      setStatusMessage(`${editor.label} updated. Please confirm the corrected value.`);
      setEditor(null);
      router.refresh();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to update Intake field.");
    } finally {
      setEditorSaving(false);
    }
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
      {targets.map((target) => {
        const confirmed = Boolean(confirmations[target.key]);
        const active = target.key === activeKey;
        const label = confirmed
          ? "Confirmed"
          : active
            ? "Confirm this value"
            : "Review after prior items";

        return createPortal(
          <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5" key={target.key}>
            {target.editable ? (
              <button
                type="button"
                onClick={() => openEditor(target)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-600 shadow-sm hover:bg-slate-50"
              >
                Edit
              </button>
            ) : null}
            <button
              type="button"
              title={label}
              aria-label={`${target.label}: ${label}`}
              onClick={() => void confirm(target)}
              disabled={savingKey === target.key || (!confirmed && !active)}
              className={`grid h-7 w-7 place-items-center rounded-full text-xs font-black shadow-sm transition disabled:cursor-not-allowed ${
                confirmed
                  ? "border border-emerald-600 bg-emerald-600 text-white"
                  : active
                    ? "border-2 border-emerald-500 bg-white text-emerald-700"
                    : "border border-slate-300 bg-white text-slate-300"
              }`}
            >
              {confirmed ? "✓" : "→"}
            </button>
          </div>,
          target.element,
        );
      })}

      <section className={`mt-5 rounded-2xl border p-5 shadow-sm ${allConfirmed ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className={`text-xs font-black uppercase tracking-[0.1em] ${allConfirmed ? "text-emerald-700" : "text-slate-400"}`}>
              Intake verification
            </div>
            <div className="mt-1 text-base font-black text-slate-950">
              {allConfirmed ? "Intake verified." : `${confirmedCount} of ${requiredCount} required items confirmed`}
            </div>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {allConfirmed
                ? "Required purchase and ownership details have been reviewed."
                : "Review or correct each highlighted item above before moving to Mechanical."}
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

      {editor ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Correct Intake value</div>
            <h3 className="mt-1 text-xl font-black text-slate-950">{editor.label}</h3>
            <input
              autoFocus
              inputMode="decimal"
              value={editorValue}
              onChange={(event) => setEditorValue(event.target.value)}
              className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-bold text-slate-950 outline-none focus:border-emerald-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveEditor()}
                disabled={editorSaving || !editorValue.trim()}
                className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-300"
              >
                {editorSaving ? "Saving..." : "Save correction"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
