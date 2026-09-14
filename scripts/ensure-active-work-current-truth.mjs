import { readFileSync, writeFileSync } from "node:fs";

function patchActiveWork() {
  const path = "components/mindful-inventory/inventory-active-work-v6.tsx";
  let source = readFileSync(path, "utf8");

  if (!source.includes('if (!work.partsReviewComplete) return null;')) {
    source = source.replace(
      'function partsPendingLabel(work: InventoryWorkOrderView) {\n  if (work.partsReadyForExecution) return null;',
      'function partsPendingLabel(work: InventoryWorkOrderView) {\n  if (!work.partsReviewComplete) return null;\n  if (work.partsReadyForExecution) return null;',
    );
  }

  if (!source.includes('work.partnerConfirmationStatus === "awaiting_owner" && work.proposedStartAt')) {
    source = source.replace(
      'function behindScheduleLabel(work: InventoryWorkOrderView, nowMs = Date.now()) {\n  if (!work.scheduledStartAt || ["complete", "cancelled"].includes(work.status)) return null;',
      'function behindScheduleLabel(work: InventoryWorkOrderView, nowMs = Date.now()) {\n  if (!work.scheduledStartAt || ["complete", "cancelled"].includes(work.status)) return null;\n  if (work.partnerConfirmationStatus === "awaiting_owner" && work.proposedStartAt) return null;',
    );
  }

  source = source.replaceAll(
    'active={!work.scheduledStartAt && (Boolean(work.proposedStartAt) || scheduleActive)}',
    'active={work.partnerConfirmationStatus === "awaiting_owner" || (!work.scheduledStartAt && (Boolean(work.proposedStartAt) || scheduleActive))}',
  );
  source = source.replaceAll(
    'done={Boolean(work.scheduledStartAt)}',
    'done={Boolean(work.scheduledStartAt) && work.partnerConfirmationStatus !== "awaiting_owner"}',
  );

  source = source.replaceAll(
    'Scheduling guidance: required parts are not ready yet.',
    'Scheduling guidance: parts setup is not complete yet.',
  );

  source = source.replaceAll(
    'work.scheduledStartAt || work.proposedStartAt',
    '(work.partnerConfirmationStatus === "awaiting_owner" && work.proposedStartAt ? work.proposedStartAt : work.scheduledStartAt || work.proposedStartAt)',
  );

  writeFileSync(path, source, "utf8");
}

function patchAvailabilityGuidance() {
  const path = "app/api/mindful/inventory/work-orders/[workOrderId]/availability/route.ts";
  let source = readFileSync(path, "utf8");
  source = source.replace(
    'if (work.parts_review_status !== "resolved") guidance.push("parts review pending");',
    'if (work.parts_review_status !== "resolved") guidance.push("parts decision pending · schedule can be planned now, but work cannot begin until Parts Review is resolved");',
  );
  writeFileSync(path, source, "utf8");
}

patchActiveWork();
patchAvailabilityGuidance();
console.log("Aligned Active Work with pending schedule proposals and unresolved parts decisions.");
