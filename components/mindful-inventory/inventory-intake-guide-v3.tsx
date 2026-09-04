"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { InventoryIntakeGuideV2 } from "@/components/mindful-inventory/inventory-intake-guide-v2";
import { MechanicalInspectorAssignment } from "@/components/mindful-inventory/mechanical-inspector-assignment";
import type { IntakeFieldConfirmation, InventoryInspectionView } from "@/lib/mindful-inventory/intake-inspection";
import type { MechanicalInspectorOption } from "@/lib/mindful-inventory/mechanical-assignment";

type Props = {
  vehicleId: string;
  initialConfirmations: Record<string, IntakeFieldConfirmation>;
  inspectorOptions: MechanicalInspectorOption[];
  inspection: InventoryInspectionView | null;
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

  const proceedButton = exactText("Proceed to Mechanical →") || exactText("Proceed to Mechanical Inspection →");
  if (proceedButton) proceedButton.textContent = "Select Mechanical Inspector →";

  const confirmedMessage = exactText("Confirmed.");
  if (confirmedMessage && confirmedMessage.closest("section")) confirmedMessage.style.display = "none";
}

export function InventoryIntakeGuideV3({ vehicleId, initialConfirmations, inspectorOptions, inspection }: Props) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);

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

  return <>
    <div onClickCapture={(event) => {
      const target = event.target as HTMLElement;
      const button = target.closest("button");
      if (button?.textContent?.includes("Select Mechanical Inspector")) {
        event.preventDefault();
        event.stopPropagation();
        setPickerOpen(true);
      }
    }}>
      <InventoryIntakeGuideV2 vehicleId={vehicleId} initialConfirmations={initialConfirmations} />
    </div>

    {pickerOpen ? <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 px-4 py-[8vh] backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setPickerOpen(false); }}>
      <div className="w-full max-w-[980px] rounded-3xl border border-white/60 bg-slate-100 p-3 shadow-2xl sm:p-4">
        <div className="mb-3 flex items-center justify-between px-1">
          <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">Mechanical inspection</div>
          <button type="button" onClick={() => setPickerOpen(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm">Close</button>
        </div>
        <MechanicalInspectorAssignment
          vehicleId={vehicleId}
          options={inspectorOptions}
          inspection={inspection}
          afterAssignPath={`/mindful/inventory/${vehicleId}/intake`}
        />
        <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-black text-slate-950">Owner mechanical inspection</div>
            <div className="mt-0.5 text-xs font-semibold text-slate-500">Use only when the owner will personally perform and validate the inspection.</div>
          </div>
          <button type="button" onClick={() => router.push(`/mindful/inventory/${vehicleId}/intake?mode=owner`)} className="shrink-0 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-800">Inspect ourselves</button>
        </div>
      </div>
    </div> : null}
  </>;
}
