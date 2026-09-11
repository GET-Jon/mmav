import { readFileSync, writeFileSync } from "node:fs";

function updateFile(path, transform) {
  const source = readFileSync(path, "utf8");
  const updated = transform(source);
  if (updated !== source) {
    writeFileSync(path, updated, "utf8");
    return true;
  }
  return false;
}

const inspectionPath = "components/mindful-inventory/inventory-mechanical-inspection.tsx";
const inspectionChanged = updateFile(inspectionPath, (source) => {
  let updated = source;

  const oldHeader = '          <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">\n            <div>\n              <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Mechanical Inspection</div>\n              <h2 className="mt-1 text-xl font-black text-slate-950">Scope Validation</h2>\n              <p className="mt-1 max-w-2xl text-sm text-slate-500">Confirm the preliminary issues and requested upgrades before the Work Plan is built.</p>\n            </div>\n            <span className={`rounded-full px-3 py-1.5 text-xs font-black ${reconciliation.pending > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>\n              {reconciliation.pending > 0 ? `${reconciliation.pending} needs review` : "Scope validated"}\n            </span>\n          </div>';
  const newHeader = '          <div className="border-b border-slate-100 pb-3">\n            <h2 className="text-xl font-black text-slate-950">Scope Validation</h2>\n          </div>';
  if (updated.includes(oldHeader)) updated = updated.replace(oldHeader, newHeader);

  const oldKnown = '          <div className="mt-5">\n            <div className="flex items-start justify-between gap-3">\n              <div>\n                <h3 className="font-black text-slate-950">Known Issues</h3>\n                <p className="mt-1 text-sm text-slate-500">Confirm whether each Lot Logic issue is actually present.</p>\n              </div>\n              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{aiFindings.length}</span>\n            </div>';
  if (updated.includes(oldKnown)) updated = updated.replace(oldKnown, '          <div className="mt-4">');

  const oldUpgrades = '          <div className="mt-6 border-t border-slate-100 pt-5">\n            <div className="flex items-start justify-between gap-3">\n              <div>\n                <h3 className="font-black text-slate-950">Requested Upgrades</h3>\n                <p className="mt-1 text-sm text-slate-500">Validate build intent with the same priority as the known scope.</p>\n              </div>\n              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{proposedUpgrades.length}</span>\n            </div>';
  if (updated.includes(oldUpgrades)) updated = updated.replace(oldUpgrades, '          <div className="mt-5 border-t border-slate-100 pt-4">');

  return updated;
});

const assignmentPath = "components/mindful-inventory/mechanical-inspector-assignment.tsx";
const assignmentChanged = updateFile(assignmentPath, (source) => {
  let updated = source;

  const oldAvailability = 'function availableAt(option: MechanicalInspectorOption, localStart: string) {\n  if (!localStart) return true;\n  const start = new Date(localStart); if (!Number.isFinite(start.getTime())) return true;\n  const durationHours = Math.max(option.typicalDurationHours || 1.5, 0.25);\n  const end = new Date(start.getTime() + durationHours * 3600000);\n  const hours = option.standardHours?.[dayKeys[start.getDay()]];\n  if (hours) {\n    if (!hours.enabled) return false;\n    const startMinutes = start.getHours() * 60 + start.getMinutes(); const endMinutes = end.getHours() * 60 + end.getMinutes();\n    if (startMinutes < minutes(hours.start) || endMinutes > minutes(hours.end) || start.toDateString() !== end.toDateString()) return false;\n  }\n  return !option.busySlots.some((slot) => start.getTime() < new Date(slot.endAt).getTime() && end.getTime() > new Date(slot.startAt).getTime());\n}';
  const newAvailability = 'type AvailabilityState = "available" | "outside_hours" | "conflict";\nfunction availabilityState(option: MechanicalInspectorOption, localStart: string): AvailabilityState {\n  if (!localStart) return "available";\n  const start = new Date(localStart); if (!Number.isFinite(start.getTime())) return "available";\n  const durationHours = Math.max(option.typicalDurationHours || 1.5, 0.25);\n  const end = new Date(start.getTime() + durationHours * 3600000);\n  const hours = option.standardHours?.[dayKeys[start.getDay()]];\n  if (hours) {\n    if (!hours.enabled) return "outside_hours";\n    const startMinutes = start.getHours() * 60 + start.getMinutes(); const endMinutes = end.getHours() * 60 + end.getMinutes();\n    if (startMinutes < minutes(hours.start) || endMinutes > minutes(hours.end) || start.toDateString() !== end.toDateString()) return "outside_hours";\n  }\n  return option.busySlots.some((slot) => start.getTime() < new Date(slot.endAt).getTime() && end.getTime() > new Date(slot.startAt).getTime()) ? "conflict" : "available";\n}\nfunction availableAt(option: MechanicalInspectorOption, localStart: string) {\n  return availabilityState(option, localStart) === "available";\n}';
  if (updated.includes(oldAvailability)) updated = updated.replace(oldAvailability, newAvailability);

  updated = updated.replace(
    '      {customTimeOpen ? <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">',
    '      {customTimeOpen ? <div className="mt-3 inline-flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">',
  );
  updated = updated.replace(
    '        <input type="datetime-local" step="900" value={requestedStartAt} onChange={(e) => setRequestedStartAt(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" />',
    '        <input type="datetime-local" step="900" value={requestedStartAt} onChange={(e) => setRequestedStartAt(e.target.value)} className="w-[460px] max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" />',
  );

  const oldStatus = '{selected && requestedStartAt ? <span className={`text-xs font-bold ${availableAt(selected, requestedStartAt) ? "text-emerald-700" : "text-red-700"}`}>{availableAt(selected, requestedStartAt) ? "Available" : "Schedule conflict"}</span> : null}';
  const newStatus = '{selected && requestedStartAt ? (() => { const state = availabilityState(selected, requestedStartAt); return <span className={`text-xs font-bold ${state === "available" ? "text-emerald-700" : "text-red-700"}`}>{state === "available" ? "Available" : state === "outside_hours" ? "Outside standard hours" : "Schedule conflict"}</span>; })() : null}';
  if (updated.includes(oldStatus)) updated = updated.replace(oldStatus, newStatus);

  return updated;
});

const ownerReviewPath = "components/mindful-inventory/mechanical-owner-finding-review-v2.tsx";
const ownerReviewChanged = updateFile(ownerReviewPath, (source) => {
  let updated = source;

  const summaryStart = updated.indexOf('      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">');
  const unresolvedStart = updated.indexOf('      {unresolvedFindings.length ? (', summaryStart);
  if (summaryStart !== -1 && unresolvedStart !== -1) {
    updated = updated.slice(0, summaryStart) + updated.slice(unresolvedStart);
  }

  const unresolvedSectionStart = updated.indexOf('        <section>\n          <div className="mb-2 flex items-center justify-between gap-3">');
  const unresolvedListStart = updated.indexOf('          <div className="space-y-2.5">', unresolvedSectionStart);
  if (unresolvedSectionStart !== -1 && unresolvedListStart !== -1) {
    updated = updated.slice(0, unresolvedSectionStart) + '        <section>\n' + updated.slice(unresolvedListStart);
  }

  updated = updated.replace('    <div className="mt-3 space-y-5">', '    <div className="mt-3 space-y-4">');

  updated = updated.replace(
    '    const isNotFound = finding.mechanicalValidationStatus === "not_found";\n    const needsDifferentPartner =',
    '    const isNotFound = finding.mechanicalValidationStatus === "not_found";\n    const isDiagnosis = finding.mechanicalValidationStatus === "needs_diagnosis";\n    const needsDifferentPartner =',
  );
  updated = updated.replace(
    '      !isNotFound &&\n      (hasLegacyUnpricedParts(finding) || !cost.pricingComplete)',
    '      !isNotFound &&\n      !isDiagnosis &&\n      !needsDifferentPartner &&\n      (hasLegacyUnpricedParts(finding) || !cost.pricingComplete)',
  );
  updated = updated.replace(
    '          ? isNotFound\n            ? `${finding.title}: mechanic result accepted. No repair will enter the Work Plan.`\n            : `${finding.title} approved for ${approvalAuthorizationLabel(cost)} and added to the Work Plan scope.`',
    '          ? isNotFound\n            ? `${finding.title}: mechanic result accepted. No repair will enter the Work Plan.`\n            : isDiagnosis\n              ? `${finding.title}: diagnostic work routed to the selected Partner.`\n              : needsDifferentPartner\n                ? `${finding.title}: work scope approved and routed to the selected Partner; final quote is pending.`\n                : `${finding.title} approved for ${approvalAuthorizationLabel(cost)} and added to the Work Plan scope.`',
  );

  const decisionSummaryNeedle = '  function renderDecisionSummary(finding: InventoryFindingView) {\n    const cost = summarizeFindingApprovalCost(';
  const decisionSummaryReplacement = '  function renderDecisionSummary(finding: InventoryFindingView) {\n    if (finding.mechanicalValidationStatus === "needs_diagnosis") {\n      const selectedPartner = finding.mechanicalCanPerform === true\n        ? inspector\n        : partnerOptions.find((partner) => partner.id === alternatePartners[finding.id]) || null;\n      return (\n        <section className="mt-3 rounded-xl border border-blue-200 bg-blue-50/50 px-4 py-3">\n          <div className="flex flex-wrap items-start justify-between gap-3">\n            <div>\n              <div className="text-[10px] font-black uppercase tracking-[0.08em] text-blue-700">Next step</div>\n              <div className="mt-0.5 text-lg font-black text-slate-950">Specialist diagnosis</div>\n              <div className="mt-1 text-sm font-semibold text-slate-600">{finding.mechanicalRecommendedAction || "Complete the next diagnostic step before deciding on a repair."}</div>\n            </div>\n            <div className="text-right text-sm">\n              <div className="font-black text-slate-900">{selectedPartner ? selectedPartner.displayName : "Choose a Partner"}</div>\n              <div className="mt-0.5 text-xs font-semibold text-slate-500">Repair scope and pricing come after diagnosis</div>\n            </div>\n          </div>\n        </section>\n      );\n    }\n\n    if (finding.mechanicalCanPerform === false) {\n      const selectedPartner = partnerOptions.find((partner) => partner.id === alternatePartners[finding.id]) || null;\n      return (\n        <section className="mt-3 rounded-xl border border-blue-200 bg-blue-50/50 px-4 py-3">\n          <div className="flex flex-wrap items-start justify-between gap-3">\n            <div>\n              <div className="text-[10px] font-black uppercase tracking-[0.08em] text-blue-700">Next step</div>\n              <div className="mt-0.5 text-lg font-black text-slate-950">Route confirmed work</div>\n              <div className="mt-1 text-sm font-semibold text-slate-600">The mechanic confirmed this scope but cannot perform it. Route it to the Partner who will quote and handle the work.</div>\n            </div>\n            <div className="text-right text-sm">\n              <div className="font-black text-slate-900">{selectedPartner ? selectedPartner.displayName : "Choose a Partner"}</div>\n              <div className="mt-0.5 text-xs font-semibold text-slate-500">Final quote and spend approval pending</div>\n            </div>\n          </div>\n        </section>\n      );\n    }\n\n    const cost = summarizeFindingApprovalCost(';
  if (updated.includes(decisionSummaryNeedle)) updated = updated.replace(decisionSummaryNeedle, decisionSummaryReplacement);

  updated = updated.replace(
    '    const clarification = finding.mechanicalOwnerReviewStatus === "clarification_requested";\n    const needsDifferentPartner = finding.mechanicalCanPerform === false;',
    '    const clarification = finding.mechanicalOwnerReviewStatus === "clarification_requested";\n    const isDiagnosis = finding.mechanicalValidationStatus === "needs_diagnosis";\n    const needsDifferentPartner = finding.mechanicalCanPerform === false;',
  );
  updated = updated.replace(
    '    const canApprove =\n      cost.pricingComplete && !hasLegacyUnpricedParts(finding) && performerReady;',
    '    const canApprove = isDiagnosis || needsDifferentPartner\n      ? performerReady\n      : cost.pricingComplete && !hasLegacyUnpricedParts(finding) && performerReady;',
  );
  updated = updated.replace(
    '        {renderPartsDisclosure(finding)}',
    '        {isDiagnosis || needsDifferentPartner ? null : renderPartsDisclosure(finding)}',
  );
  updated = updated.replace(
    '                finding.mechanicalCanPerform === null\n                  ? "Mechanic must confirm whether they can perform this work"\n                  : !cost.pricingComplete || hasLegacyUnpricedParts(finding)',
    '                finding.mechanicalCanPerform === null\n                  ? "Mechanic must confirm whether they can perform this work"\n                  : isDiagnosis || needsDifferentPartner\n                    ? undefined\n                    : !cost.pricingComplete || hasLegacyUnpricedParts(finding)',
  );
  updated = updated.replace(
    '              {needsDifferentPartner\n                ? `Approve & Route · up to ${money(cost.totalHigh)}`\n                : cost.hasRange',
    '              {isDiagnosis\n                ? selectedAlternatePartner\n                  ? `Send to ${partnerOptions.find((partner) => partner.id === selectedAlternatePartner)?.displayName || "Partner"} for Diagnosis`\n                  : "Choose Partner to Continue"\n                : needsDifferentPartner\n                  ? selectedAlternatePartner\n                    ? `Approve Scope & Route to ${partnerOptions.find((partner) => partner.id === selectedAlternatePartner)?.displayName || "Partner"}`\n                    : "Choose Partner to Continue"\n                  : cost.hasRange',
  );

  return updated;
});

const workPlanPath = "app/api/mindful/inventory/vehicles/[id]/work-plan/generate/route.ts";
const workPlanChanged = updateFile(workPlanPath, (source) => {
  let updated = source;
  const authScope = '        const hasOwnerAuthorizedFindingScope =\n          !item.upgradeId &&\n          item.findingIds.length > 0 &&\n          linkedApprovedFindings.length === item.findingIds.length &&\n          authorizationCosts.length === item.findingIds.length &&\n          authorizationCosts.every((cost) => cost?.pricingComplete && cost.totalLow !== null && cost.totalHigh !== null);';
  const routedScopes = authScope + '\n        const hasOwnerApprovedDiagnosticScope =\n          !item.upgradeId &&\n          item.findingIds.length > 0 &&\n          linkedApprovedFindings.length === item.findingIds.length &&\n          linkedApprovedFindings.every((finding) => finding?.mechanicalValidationStatus === "needs_diagnosis");\n        const hasOwnerApprovedRoutedScope =\n          !item.upgradeId &&\n          item.findingIds.length > 0 &&\n          linkedApprovedFindings.length === item.findingIds.length &&\n          linkedApprovedFindings.every((finding) => finding?.mechanicalCanPerform === false && Boolean(finding?.ownerPreferredPartnerId));';
  if (updated.includes(authScope) && !updated.includes('hasOwnerApprovedDiagnosticScope')) updated = updated.replace(authScope, routedScopes);
  updated = updated.replace(
    '        const decision = hasOwnerAuthorizedFindingScope ? "approved" : item.decision;\n        const managerInvestigationRequired = hasOwnerAuthorizedFindingScope ? false : item.managerInvestigationRequired;',
    '        const ownerApprovedScope = hasOwnerAuthorizedFindingScope || hasOwnerApprovedDiagnosticScope || hasOwnerApprovedRoutedScope;\n        const decision = ownerApprovedScope ? "approved" : item.decision;\n        const managerInvestigationRequired = ownerApprovedScope ? false : item.managerInvestigationRequired;',
  );
  return updated;
});

if (inspectionChanged) console.log("Simplified Mechanical Inspection scope hierarchy.");
if (assignmentChanged) console.log("Refined Mechanical inspector custom scheduling UX.");
if (ownerReviewChanged) console.log("Simplified Owner mechanical review hierarchy and made routed scope actionable.");
if (workPlanChanged) console.log("Preserved Owner-approved diagnostic and quote-pending routing in Work Plan generation.");
