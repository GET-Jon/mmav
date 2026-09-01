"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import type { IntakeFieldConfirmation } from "@/lib/mindful-inventory/intake-inspection";

type Props = {
  vehicleId: string;
  initialConfirmations: Record<string, IntakeFieldConfirmation>;
};

type VerifyTarget = {
  key: string;
  label: string;
  element: HTMLElement;
};

const verificationOrder = [
  { key: "vin", label: "VIN" },
  { key: "purchase_mileage", label: "Mileage" },
  { key: "title_status", label: "Title Status" },
  { key: "purchase_date", label: "Purchase Date" },
  { key: "vehicle_owner", label: "Vehicle Owner" },
  { key: "purchase_price", label: "Purchase" },
  { key: "buyer_fees", label: "Buyer Fees" },
  { key: "transport_cost", label: "Transport" },
  { key: "other_acquisition", label: "Other Acquisition" },
] as const;

function findExactText(text: string) {
  return Array.from(document.querySelectorAll<HTMLElement>("div,dt,label,h2,h3"))
    .find((element) => element.textContent?.trim() === text) || null;
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
    .filter((line) => line !== target.label && !line.includes("Confirm"));

  return lines[0] || null;
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

function tightenPageCopy() {
  const heading = findExactText("What we know about this car");
  const actionSection = heading?.closest<HTMLElement>("section");
  if (heading?.parentElement) {
    heading.parentElement.style.display = "none";
  }
  if (actionSection) {
    actionSection.style.paddingTop = "0.75rem";
    actionSection.style.paddingBottom = "0.75rem";
    const proceedButton = Array.from(actionSection.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("Proceed to Mechanical"));
    if (proceedButton?.parentElement) {
      proceedButton.parentElement.style.marginLeft = "auto";
    }
  }

  const currentRecon = findExactText("Current Recon");
  if (currentRecon) {
    currentRecon.textContent = "Projected Recon";
    const card = currentRecon.closest<HTMLElement>(".rounded-xl");
    const sub = card?.querySelectorAll<HTMLElement>("div")[2];
    if (sub) {
      sub.textContent = "open findings + proposed upgrades";
    }
  }
}

export function InventoryIntakeGuide({ vehicleId, initialConfirmations }: Props) {
  const [confirmations, setConfirmations] = useState(initialConfirmations);
  const [targets, setTargets] = useState<VerifyTarget[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    tightenPageCopy();
    const cleanupMileage = formatMileageField();

    const discover = () => {
      const next = verificationOrder
        .map(({ key, label }) => {
          const element = findVerificationCard(label);
          return element ? { key, label, element } : null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
      setTargets(next);
    };

    discover();
    const timer = window.setTimeout(discover, 250);
    return () => {
      window.clearTimeout(timer);
      cleanupMileage();
    };
  }, []);

  const activeKey = useMemo(
    () => targets.find((target) => !confirmations[target.key])?.key || null,
    [targets, confirmations],
  );

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
    setSavingKey(target.key);
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
      if (!response.ok) throw new Error(payload.error || "Failed to confirm intake field.");
      setConfirmations(payload.fieldConfirmations || {});
    } catch (error) {
      console.error("Failed to confirm intake field:", error);
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <>
      {targets.map((target) => {
        const confirmed = Boolean(confirmations[target.key]);
        const active = target.key === activeKey;
        const label = confirmed ? "Confirmed" : active ? "Confirm this value" : "Review after prior items";

        return createPortal(
          <button
            key={target.key}
            type="button"
            title={label}
            aria-label={`${target.label}: ${label}`}
            onClick={() => void confirm(target)}
            disabled={savingKey === target.key}
            className={`absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full text-xs font-black shadow-sm transition disabled:opacity-50 ${
              confirmed
                ? "border border-emerald-600 bg-emerald-600 text-white"
                : active
                  ? "border-2 border-emerald-500 bg-white text-emerald-700"
                  : "border border-slate-300 bg-white text-slate-400"
            }`}
          >
            {confirmed ? "✓" : "→"}
          </button>,
          target.element,
        );
      })}
    </>
  );
}
