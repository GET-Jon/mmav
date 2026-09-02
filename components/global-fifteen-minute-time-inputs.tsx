"use client";

import { useEffect } from "react";

export function GlobalFifteenMinuteTimeInputs() {
  useEffect(() => {
    function apply(root: ParentNode) {
      root.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]').forEach((input) => {
        input.step = "900";
      });
    }

    apply(document);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (!(node instanceof Element)) continue;
          if (node.matches('input[type="datetime-local"]')) {
            (node as HTMLInputElement).step = "900";
          }
          apply(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
