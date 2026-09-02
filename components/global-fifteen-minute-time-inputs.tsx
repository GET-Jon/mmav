"use client";

import { useEffect } from "react";

const FIFTEEN_MINUTES_IN_SECONDS = 15 * 60;
const TIME_INPUT_SELECTOR = 'input[type="time"], input[type="datetime-local"]';

function applyFifteenMinuteStep(root: ParentNode) {
  root.querySelectorAll<HTMLInputElement>(TIME_INPUT_SELECTOR).forEach((input) => {
    if (input.dataset.timeStepOptOut === "true") {
      return;
    }

    const desiredStep = String(FIFTEEN_MINUTES_IN_SECONDS);

    if (input.getAttribute("step") !== desiredStep) {
      input.setAttribute("step", desiredStep);
    }
  });
}

export function GlobalFifteenMinuteTimeInputs() {
  useEffect(() => {
    applyFifteenMinuteStep(document);

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes") {
          const target = record.target;

          if (
            target instanceof HTMLInputElement &&
            target.matches(TIME_INPUT_SELECTOR) &&
            target.dataset.timeStepOptOut !== "true"
          ) {
            const desiredStep = String(FIFTEEN_MINUTES_IN_SECONDS);

            if (target.getAttribute("step") !== desiredStep) {
              target.setAttribute("step", desiredStep);
            }
          }

          continue;
        }

        for (const node of Array.from(record.addedNodes)) {
          if (!(node instanceof Element)) {
            continue;
          }

          if (
            node instanceof HTMLInputElement &&
            node.matches(TIME_INPUT_SELECTOR) &&
            node.dataset.timeStepOptOut !== "true"
          ) {
            node.setAttribute("step", String(FIFTEEN_MINUTES_IN_SECONDS));
          }

          applyFifteenMinuteStep(node);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["type", "step", "data-time-step-opt-out"],
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
