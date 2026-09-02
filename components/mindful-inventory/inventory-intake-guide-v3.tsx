"use client";

import { useEffect } from "react";

import { InventoryIntakeGuideV2 } from "@/components/mindful-inventory/inventory-intake-guide-v2";
import type { IntakeFieldConfirmation } from "@/lib/mindful-inventory/intake-inspection";

type Props = {
  vehicleId: string;
  initialConfirmations: Record<string, IntakeFieldConfirmation>;
};

function exactText(text: string) {
  return Array.from(document.querySelectorAll<HTMLElement>("div,h2,h3,p,button")).find(
    (element) => element.textContent?.trim() === text,
  ) || null;
}

function polishIntakeHandoff() {
  const duplicateHeading = exactText("Ready for Mechanical Inspection?");
  const duplicateSection = duplicateHeading?.closest<HTMLElement>("section");
  if (duplicateSection) duplicateSection.style.display = "none";

  const completedHeading = exactText("Intake verified.");
  if (completedHeading) completedHeading.textContent = "Intake complete.";

  const completedCopy = exactText("Mileage, title status, and purchase price have been verified.");
  if (completedCopy) completedCopy.textContent = "Required intake values verified. Ready for Mechanical Inspection.";

  const proceedButton = exactText("Proceed to Mechanical →");
  if (proceedButton) proceedButton.textContent = "Proceed to Mechanical Inspection →";

  const confirmedMessage = exactText("Confirmed.");
  if (confirmedMessage && confirmedMessage.closest("section")) confirmedMessage.style.display = "none";
}

export function InventoryIntakeGuideV3(props: Props) {
  useEffect(() => {
    polishIntakeHandoff();
    const timer = window.setTimeout(polishIntakeHandoff, 150);
    const observer = new MutationObserver(polishIntakeHandoff);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  return <InventoryIntakeGuideV2 {...props} />;
}
