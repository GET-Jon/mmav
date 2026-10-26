"use client";

import {
  useEffect,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

type UsageStatus = {
  canStartEvaluation?: boolean;
  evaluationAccessMessage?: string | null;
  status?: string;
  postCancelBalance?: number;
  postCancelStartsAt?: string | null;
};

export function EvaluationAccessGuard({ children }: { children: ReactNode }) {
  const [exhausted, setExhausted] = useState(false);
  const [creditsScheduled, setCreditsScheduled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      try {
        const response = await fetch("/api/usage/status", { cache: "no-store" });
        const data = (await response.json()) as UsageStatus;

        if (!cancelled && response.ok) {
          setExhausted(data.canStartEvaluation === false);
          setCreditsScheduled(data.status === "canceled" && Number(data.postCancelBalance || 0) > 0 && Boolean(data.postCancelStartsAt) && Date.parse(data.postCancelStartsAt || "") > Date.now());
          setMessage(data.evaluationAccessMessage || null);
        }
      } catch {
        // Server-side usage checks remain authoritative. A failed cosmetic
        // access check should never freeze an existing evaluation.
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

  function entryAction(target: EventTarget | null) {
    // Let the evaluator show its persistent inline explanation for
    // future-dated cancellation credits, rather than opening a paywall.
    if (!exhausted || creditsScheduled || !(target instanceof Element)) return null;
    return target.closest<HTMLElement>(
      "[data-evaluation-entry-action='true']",
    );
  }

  function showPricing() {
    window.dispatchEvent(
      new CustomEvent("lotlogic:evaluation-limit-reached", {
        detail: {
          message:
            message ||
            "You’ve used your available evaluations. Choose a plan to start another.",
        },
      }),
    );
  }

  function blockMouseAction(event: MouseEvent<HTMLDivElement>) {
    if (!entryAction(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    showPricing();
  }

  function blockKeyboardAction(event: KeyboardEvent<HTMLDivElement>) {
    if (
      (event.key !== "Enter" && event.key !== " ") ||
      !entryAction(event.target)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    showPricing();
  }

  return (
    <div onClickCapture={blockMouseAction} onKeyDownCapture={blockKeyboardAction}>
      {children}
    </div>
  );
}
