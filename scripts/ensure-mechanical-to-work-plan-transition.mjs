import { readFileSync, writeFileSync } from "node:fs";

// V15 sequencing rule:
// Finding approval resolves scope/budget/performer only.
// The Owner must then accept the submitted inspection.
// Work Plan generation belongs to InventoryMechanicalNextStep after inspection completion.

const reviewPath =
  "components/mindful-inventory/mechanical-owner-finding-review-v2.tsx";
let review = readFileSync(reviewPath, "utf8");

const autoStart = review.indexOf("      const finishingMechanicalReview =");
const normalMessageStart =
  autoStart >= 0
    ? review.indexOf('      setMessage(\n        decision === "accept"', autoStart)
    : -1;

if (autoStart >= 0) {
  if (normalMessageStart < 0) {
    throw new Error(
      "Found legacy final-finding auto transition but could not locate normal review completion block.",
    );
  }
  review = review.slice(0, autoStart) + review.slice(normalMessageStart);
  writeFileSync(reviewPath, review, "utf8");
  console.log(
    "Removed premature Work Plan generation from final finding approval.",
  );
} else {
  console.log(
    "Finding approval already waits for inspection acceptance before Work Plan generation.",
  );
}

// Keep Mechanical page's InventoryMechanicalNextStep intact.
// It is the correct work-plan transition after inspection completion.
const intakePath = "app/mindful/inventory/[id]/intake/page.tsx";
const intake = readFileSync(intakePath, "utf8");

if (
  !intake.includes("InventoryMechanicalNextStep") ||
  !intake.includes('inspectionComplete={inspection?.status === "complete"}')
) {
  throw new Error(
    "Mechanical Next Step boundary is missing; refusing to build without a post-inspection Work Plan transition.",
  );
}

console.log(
  "Mechanical → Work Plan sequencing is aligned: findings → inspection acceptance → Work Plan.",
);
