"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type UsageStatus = {
  canStartEvaluation?: boolean;
};

function isVehicleNext(element: HTMLElement) {
  if (element.tagName !== "BUTTON") return false;
  if (!element.textContent?.trim().startsWith("Next")) return false;

  let current: HTMLElement | null = element;
  for (let depth = 0; current && depth < 7; depth += 1) {
    if (current.textContent?.includes("1 · VEHICLE")) return true;
    current = current.parentElement;
  }

  return false;
}

export function EvaluationAccessGuard({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      try {
        const response = await fetch("/api/usage/status", { cache: "no-store" });
        const data = (await response.json()) as UsageStatus;
        if (!cancelled && response.ok) {
          setExhausted(data.canStartEvaluation === false);
        }
      } catch {
        // The workspace performs its own authoritative allowance check before
        // any paid market/AI request. If this cosmetic guard cannot load, do
        // not lock the evaluator based on an uncertain network state.
      }
    }

    void checkAccess();
    window.addEventListener("focus", checkAccess);
    window.addEventListener("pageshow", checkAccess);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", checkAccess);
      window.removeEventListener("pageshow", checkAccess);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    function syncDisabledActions() {
      const actions = root.querySelectorAll<HTMLElement>("button, a[href]");

      actions.forEach((action) => {
        const insidePlanDialog = Boolean(action.closest("dialog[open]"));
        const shouldDisable = exhausted && !insidePlanDialog && !isVehicleNext(action);

        if (shouldDisable) {
          action.dataset.evaluationLimitDisabled = "true";
          action.setAttribute("aria-disabled", "true");
        } else if (action.dataset.evaluationLimitDisabled === "true") {
          delete action.dataset.evaluationLimitDisabled;
          action.removeAttribute("aria-disabled");
        }
      });
    }

    syncDisabledActions();
    const observer = new MutationObserver(syncDisabledActions);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      root.querySelectorAll<HTMLElement>("[data-evaluation-limit-disabled='true']").forEach((action) => {
        delete action.dataset.evaluationLimitDisabled;
        action.removeAttribute("aria-disabled");
      });
    };
  }, [exhausted]);

  function blockExhaustedAction(event: React.SyntheticEvent) {
    if (!exhausted) return;
    const target = event.target as HTMLElement | null;
    const action = target?.closest<HTMLElement>("button, a[href]");
    if (!action || action.closest("dialog[open]") || isVehicleNext(action)) return;

    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div
      ref={rootRef}
      onClickCapture={blockExhaustedAction}
      onKeyDownCapture={(event) => {
        if (event.key === "Enter" || event.key === " ") blockExhaustedAction(event);
      }}
      className="[&_button[data-evaluation-limit-disabled='true']]:cursor-not-allowed [&_button[data-evaluation-limit-disabled='true']]:opacity-35 [&_a[data-evaluation-limit-disabled='true']]:cursor-not-allowed [&_a[data-evaluation-limit-disabled='true']]:opacity-35"
    >
      {children}
    </div>
  );
}
