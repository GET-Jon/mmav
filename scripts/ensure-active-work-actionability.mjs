import { readFileSync, writeFileSync } from "node:fs";

const path = "components/mindful-inventory/inventory-active-work-v6.tsx";
const source = readFileSync(path, "utf8");
let updated = source;

function replaceOnce(oldText, newText, label) {
  if (updated.includes(newText)) return;
  if (!updated.includes(oldText)) throw new Error(`Could not find ${label}. Refusing to patch Active Work actionability.`);
  updated = updated.replace(oldText, newText);
}

replaceOnce(
  'function nextIssue(work: InventoryWorkOrderView) {\n  if (["complete", "cancelled"].includes(work.status)) return null;',
  'function partsScheduleConflict(work: InventoryWorkOrderView) {\n  if (!work.scheduledStartAt || !work.partsLatestEtaAt || work.partsReadyForExecution || work.pendingPartCount <= 0) return null;\n  const scheduledMs = new Date(work.scheduledStartAt).getTime();\n  const etaMs = new Date(work.partsLatestEtaAt).getTime();\n  if (!Number.isFinite(scheduledMs) || !Number.isFinite(etaMs) || etaMs <= scheduledMs) return null;\n  return `Parts arrive ${dateTimeLabel(work.partsLatestEtaAt)} after work is scheduled ${dateTimeLabel(work.scheduledStartAt)}`;\n}\n\nfunction nextIssue(work: InventoryWorkOrderView) {\n  if (["complete", "cancelled"].includes(work.status)) return null;\n  const scheduleConflict = partsScheduleConflict(work);\n  if (scheduleConflict) return scheduleConflict;',
  "parts schedule conflict helper",
);

replaceOnce(
  '  if (work.status === "blocked") return { label: "Blocked", cls: "bg-red-100 text-red-800" };\n  if (behindScheduleLabel(work)) return { label: "Behind Schedule", cls: "bg-red-100 text-red-800" };',
  '  if (work.status === "blocked") return { label: "Blocked", cls: "bg-red-100 text-red-800" };\n  if (partsScheduleConflict(work)) return { label: "Schedule Conflict", cls: "bg-red-100 text-red-800" };\n  if (behindScheduleLabel(work)) return { label: "Behind Schedule", cls: "bg-red-100 text-red-800" };',
  "schedule conflict state",
);

replaceOnce(
  '        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3"><h3 className="text-sm font-black">Execution plan</h3><p className="mt-0.5 text-[11px] text-slate-500">Resolve parts first, then Partner, quote, location, and schedule. Execution unlocks only when every prerequisite is ready.</p></div>',
  '        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3"><h3 className="text-sm font-black">Execution plan</h3><p className="mt-0.5 text-[11px] text-slate-500">Resolve any available setup item directly here. Parts, quote, and location can progress in parallel; execution unlocks only when every prerequisite is ready.</p></div>',
  "execution plan guidance",
);

replaceOnce(
  '            const state = stateFor(work);\n            const late = behindScheduleLabel(work);\n            const issue = nextIssue(work);',
  '            const state = stateFor(work);\n            const late = behindScheduleLabel(work);\n            const scheduleConflict = partsScheduleConflict(work);\n            const issue = nextIssue(work);',
  "row schedule conflict computation",
);

replaceOnce(
  '            const partsActive = !work.partsReviewComplete;\n            const partnerActive = work.partsReviewComplete && !work.performerName;\n            const quoteActive = work.partsReviewComplete && Boolean(work.performerName) && !quoteComplete;\n            const locationActive = work.partsReviewComplete && Boolean(work.performerName) && quoteComplete && !work.locationId;',
  '            const partsActive = !work.partsReviewComplete || !work.partsReadyForExecution;\n            const partnerActive = work.partsReviewComplete && !work.performerName;\n            const quoteActive = work.partsReviewComplete && Boolean(work.performerName) && !quoteComplete;\n            const locationActive = work.partsReviewComplete && Boolean(work.performerName) && !work.locationId;',
  "parallel setup activity",
);

replaceOnce(
  '                    <div className={`rounded-xl border p-3 ${late ? "border-red-200 bg-red-50/50" : issue ? "border-amber-200 bg-amber-50/50" : "border-slate-200 bg-slate-50"}`}>',
  '                    <div className={`rounded-xl border p-3 ${late || scheduleConflict ? "border-red-200 bg-red-50/50" : issue ? "border-amber-200 bg-amber-50/50" : "border-slate-200 bg-slate-50"}`}>',
  "row conflict styling",
);

replaceOnce(
  '                      {issue ? <div className={`mt-3 border-t pt-2 text-xs font-black ${late ? "border-red-200 text-red-700" : "border-amber-200 text-amber-800"}`}>{late ? `Exception: ${late}` : `Next: ${issue}`}</div> : !done ? <div className="mt-3 border-t border-slate-200 pt-2 text-xs font-black text-emerald-700">✓ Ready for execution</div> : null}',
  '                      {scheduleConflict ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700">⚠ Schedule conflict: {scheduleConflict}. Reschedule the work or expedite the part.</div> : null}\n                      {issue ? <div className={`mt-3 border-t pt-2 text-xs font-black ${late || scheduleConflict ? "border-red-200 text-red-700" : "border-amber-200 text-amber-800"}`}>{late ? `Exception: ${late}` : scheduleConflict ? "Next: Resolve parts / schedule conflict" : `Next: ${issue}`}</div> : !done ? <div className="mt-3 border-t border-slate-200 pt-2 text-xs font-black text-emerald-700">✓ Ready for execution</div> : null}',
  "schedule conflict warning",
);

replaceOnce(
  '{(locationActive || editing) && work.partsReviewComplete && work.performerName && quoteComplete ? <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3">',
  '{(locationActive || editing) && work.partsReviewComplete && work.performerName ? <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3">',
  "location action availability",
);

if (updated !== source) {
  writeFileSync(path, updated, "utf8");
  console.log("Made Active Work setup directly actionable and added parts/schedule conflict warnings.");
}
