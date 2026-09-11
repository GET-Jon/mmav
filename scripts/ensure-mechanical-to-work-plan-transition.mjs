import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(source, oldText, newText, label) {
  if (source.includes(newText)) return source;
  if (!source.includes(oldText)) {
    console.log(`Skipped ${label}; target already changed or no longer matches the legacy markup.`);
    return source;
  }
  return source.replace(oldText, newText);
}

// 1) Final Owner decision should immediately build/open the Work Plan.
const reviewPath = "components/mindful-inventory/mechanical-owner-finding-review-v2.tsx";
let review = readFileSync(reviewPath, "utf8");

if (!review.includes("const finishingMechanicalReview =")) {
  const startMarker = '      setMessage(\n        decision === "accept"';
  const endMarker = "      router.refresh();";
  const start = review.indexOf(startMarker);
  const endStart = start >= 0 ? review.indexOf(endMarker, start) : -1;

  if (start >= 0 && endStart >= 0) {
    const end = endStart + endMarker.length;
    const newAfterSave = `      const finishingMechanicalReview =\n        decision !== "clarification" &&\n        unresolvedFindings.length === 1 &&\n        unresolvedFindings[0]?.id === finding.id;\n\n      if (finishingMechanicalReview) {\n        setMessage("Mechanical review complete. Building the Preliminary Work Plan…");\n        const planResponse = await fetch(\n          \`/api/mindful/inventory/vehicles/\${vehicleId}/work-plan/generate\`,\n          { method: "POST" },\n        );\n        if (!planResponse.ok) {\n          const planPayload = (await planResponse.json().catch(() => ({}))) as { error?: string };\n          throw new Error(planPayload.error || "Mechanical review was saved, but the Preliminary Work Plan could not be built.");\n        }\n        router.push(\`/mindful/inventory/\${vehicleId}/car-plan?from=mechanical\`);\n        router.refresh();\n        return;\n      }\n\n      setMessage(\n        decision === "accept"\n          ? \`\${finding.title} approved for \${approvalAuthorizationLabel(cost)} and added to the Work Plan scope.\`\n          : decision === "dismiss"\n            ? \`\${finding.title} dismissed from the mechanical scope.\`\n            : \`Clarification requested from the mechanic for \${finding.title}.\`,\n      );\n      router.refresh();`;

    review = review.slice(0, start) + newAfterSave + review.slice(end);
    writeFileSync(reviewPath, review, "utf8");
  } else {
    console.log("Skipped final Owner review transition; current V2 component no longer matches the expected save block.");
  }
}

// 2) Mechanical page should be history/review, not a transition screen.
const intakePath = "app/mindful/inventory/[id]/intake/page.tsx";
let intake = readFileSync(intakePath, "utf8");
intake = intake.replace('import { InventoryMechanicalNextStep } from "@/components/mindful-inventory/inventory-mechanical-next-step";\n', "");

const oldCompleteBlock = `        !submittedForOwner ? inspection?.status === "complete" ? (\n          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 shadow-sm">\n            <div className="text-xs font-black uppercase tracking-[0.1em] text-emerald-700">Mechanical complete</div>\n            <h2 className="mt-1 text-xl font-black text-slate-950">Partner inspection accepted</h2>\n            <p className="mt-1 text-sm font-medium text-slate-600">The assigned mechanic completed the inspection and the Owner accepted it. The inspector assignment remains attached to the project history.</p>\n          </section>\n        ) : (`;

const newCompleteBlock = `        !submittedForOwner ? inspection?.status === "complete" ? (\n          <>\n            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 shadow-sm">\n              <div className="text-xs font-black uppercase tracking-[0.1em] text-emerald-700">Mechanical complete ✓</div>\n              <h2 className="mt-1 text-lg font-black text-slate-950">Completed inspection record</h2>\n              <p className="mt-1 text-sm font-medium text-slate-600">The mechanic&apos;s findings, Owner decisions, approved spend, upgrade assessment, and inspector assignment remain here as vehicle history.</p>\n            </section>\n            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">\n              <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Inspection Findings</div>\n              <h2 className="mt-1 text-xl font-black text-slate-950">Mechanical inspection history</h2>\n              <MechanicalOwnerFindingReviewV2\n                vehicleId={vehicle.id}\n                findings={submittedFindings}\n                partnerOptions={ownerReviewPartners}\n                inspectorPartnerId={inspection?.performedByPartnerId || null}\n              />\n            </section>\n            <MechanicalOwnerUpgradeReview upgrades={overview.upgrades} />\n          </>\n        ) : (`;
intake = replaceOnce(intake, oldCompleteBlock, newCompleteBlock, "completed mechanical history view");

const nextStepStart = `\n      {(partnerFlowStatus || ownerInspectionMode || inspection?.status === "complete") ? <InventoryMechanicalNextStep\n        vehicleId={vehicle.id}\n        inspectionComplete={inspection?.status === "complete"}\n        planningReady={inspectionData.planningReady}\n      /> : null}`;
if (intake.includes(nextStepStart)) intake = intake.replace(nextStepStart, "");
writeFileSync(intakePath, intake, "utf8");

// 3) Show the completion confirmation where it matters: on the Work Plan.
const planPath = "app/mindful/inventory/[id]/car-plan/page.tsx";
let plan = readFileSync(planPath, "utf8");
plan = replaceOnce(
  plan,
  'export default async function InventoryCarPlanPage({ params }: { params: Promise<{ id: string }> }) {',
  'export default async function InventoryCarPlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {',
  "Work Plan search params",
);
plan = replaceOnce(
  plan,
  '  const { id } = await params;\n',
  '  const [{ id }, query] = await Promise.all([params, searchParams]);\n',
  "Work Plan query resolution",
);

const oldReturn = `  return (\n    <InventoryWorkPlanV2\n      vehicleId={vehicle.id}\n      planningReady={intakeInspection.planningReady}\n      plan={carPlan}\n      findings={intakeInspection.findings}\n      upgrades={overview.upgrades}\n      performers={performers}\n      partsReview={partsReview}\n    />\n  );`;
const newReturn = `  return (\n    <div className="space-y-4">\n      {query.from === "mechanical" ? (\n        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 shadow-sm">\n          <div className="text-xs font-black uppercase tracking-[0.1em] text-emerald-700">Mechanical inspection complete ✓</div>\n          <div className="mt-1 text-sm font-semibold text-emerald-900">Owner-approved findings, spend authorizations, Partner routing, and upgrade assessments have been incorporated into the Preliminary Work Plan.</div>\n        </section>\n      ) : null}\n      <InventoryWorkPlanV2\n        vehicleId={vehicle.id}\n        planningReady={intakeInspection.planningReady}\n        plan={carPlan}\n        findings={intakeInspection.findings}\n        upgrades={overview.upgrades}\n        performers={performers}\n        partsReview={partsReview}\n      />\n    </div>\n  );`;
plan = replaceOnce(plan, oldReturn, newReturn, "Work Plan completion banner");
writeFileSync(planPath, plan, "utf8");

console.log("Mechanical → Work Plan transition is aligned.");
