import { readFileSync, writeFileSync } from "node:fs";

const path = "components/mindful-inventory/inventory-schedule-board.tsx";
const source = readFileSync(path, "utf8");
let updated = source;

function replaceOnce(before, after) {
  if (updated.includes(before)) updated = updated.replace(before, after);
}

if (!updated.includes("function planningStart(item: InventoryScheduleWork)")) {
  replaceOnce(
    'function performerKey(item: InventoryScheduleWork) {\n  if (item.assignedPartnerId) return `partner:${item.assignedPartnerId}`;\n  if (item.assignedUserId) return `user:${item.assignedUserId}`;\n  return "unassigned";\n}\n',
    'function performerKey(item: InventoryScheduleWork) {\n  if (item.assignedPartnerId) return `partner:${item.assignedPartnerId}`;\n  if (item.assignedUserId) return `user:${item.assignedUserId}`;\n  return "unassigned";\n}\nfunction planningStart(item: InventoryScheduleWork) {\n  return item.scheduledStartAt || item.proposedStartAt || null;\n}\nfunction planningEnd(item: InventoryScheduleWork) {\n  return item.scheduledEndAt || item.proposedEndAt || null;\n}\nfunction isProposed(item: InventoryScheduleWork) {\n  return !item.scheduledStartAt && Boolean(item.proposedStartAt);\n}\nfunction schedulingAttentionReason(item: InventoryScheduleWork) {\n  if (!item.performerName) return "No assignee selected";\n  if (!item.locationId) return "No location selected";\n  return "No calendar slot selected";\n}\n',
  );
}

replaceOnce(
  'function overlaps(a: InventoryScheduleWork, b: InventoryScheduleWork) {\n  if (!a.scheduledStartAt || !a.scheduledEndAt || !b.scheduledStartAt || !b.scheduledEndAt) return false;\n  return new Date(a.scheduledStartAt).getTime() < new Date(b.scheduledEndAt).getTime()\n    && new Date(a.scheduledEndAt).getTime() > new Date(b.scheduledStartAt).getTime();\n}',
  'function overlaps(a: InventoryScheduleWork, b: InventoryScheduleWork) {\n  const aStart = planningStart(a);\n  const aEnd = planningEnd(a);\n  const bStart = planningStart(b);\n  const bEnd = planningEnd(b);\n  if (!aStart || !aEnd || !bStart || !bEnd) return false;\n  return new Date(aStart).getTime() < new Date(bEnd).getTime()\n    && new Date(aEnd).getTime() > new Date(bStart).getTime();\n}',
);

replaceOnce(
  '  const unscheduled = active.filter((item) => !item.scheduledStartAt).sort((a, b) => Number(a.vehiclePriority) - Number(b.vehiclePriority));',
  '  const unscheduled = active.filter((item) => !planningStart(item)).sort((a, b) => Number(a.vehiclePriority) - Number(b.vehiclePriority));',
);

replaceOnce(
  '    const scheduledActive = scheduleWork.filter((item) => item.status !== "complete" && item.status !== "cancelled" && item.scheduledStartAt && item.scheduledEndAt);',
  '    const scheduledActive = scheduleWork.filter((item) => item.status !== "complete" && item.status !== "cancelled" && planningStart(item) && planningEnd(item));',
);

replaceOnce(
  '    if (!item.scheduledStartAt || item.status === "cancelled") return false;\n    const when = new Date(item.scheduledStartAt).getTime();',
  '    const plannedStart = planningStart(item);\n    if (!plannedStart || item.status === "cancelled") return false;\n    const when = new Date(plannedStart).getTime();',
);

replaceOnce(
  '    const elapsed = item.elapsedMinutes ?? item.legacyDurationMinutes;\n    const itemConflicts = conflictsByItem.get(item.id) || [];',
  '    const elapsed = item.elapsedMinutes ?? item.legacyDurationMinutes;\n    const planStart = planningStart(item);\n    const proposed = isProposed(item);\n    const itemConflicts = conflictsByItem.get(item.id) || [];',
);

replaceOnce(
  '              : missing\n                  ? "border-amber-300 hover:border-amber-500"\n                  : "border-slate-200 hover:border-slate-400";',
  '              : missing\n                  ? "border-amber-300 hover:border-amber-500"\n                  : proposed\n                    ? "border-blue-300 border-dashed bg-blue-50/30 hover:border-blue-500"\n                    : "border-slate-200 hover:border-slate-400";',
);

replaceOnce(
  '{item.scheduledStartAt ? new Date(item.scheduledStartAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "Unscheduled"}',
  '{planStart ? new Date(planStart).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "Needs scheduling"}',
);

replaceOnce(
  '{complete ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-500">Complete</span> : null}',
  '{complete ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-500">Complete</span> : null}\n          {!complete && proposed ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-black uppercase text-blue-700">Proposed</span> : null}',
);

replaceOnce(
  '          const items = weekWork.filter((item) => item.scheduledStartAt && dayKey(new Date(item.scheduledStartAt)) === dayKey(day) && visible(item));',
  '          const items = weekWork.filter((item) => { const start = planningStart(item); return start && dayKey(new Date(start)) === dayKey(day) && visible(item); });',
);

updated = updated.replaceAll(
  'new Date(a.scheduledStartAt || 0).getTime() - new Date(b.scheduledStartAt || 0).getTime()',
  'new Date(planningStart(a) || 0).getTime() - new Date(planningStart(b) || 0).getTime()',
);

const oldJump = '<button type="button" onClick={scrollToUnscheduled} className={`rounded-full px-3 py-1.5 text-xs font-black ${unscheduled.length > 0 ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : "bg-slate-100 text-slate-500"}`}>Unscheduled ({unscheduled.length})</button>';
const interimJump = '<span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />\n        <button type="button" onClick={scrollToUnscheduled} className={`rounded-lg border px-3 py-1.5 text-xs font-black ${unscheduled.length > 0 ? "border-blue-300 bg-white text-blue-700 shadow-sm hover:bg-blue-50" : "border-slate-200 bg-white text-slate-400"}`}>↓ Needs scheduling ({unscheduled.length})</button>';
const newJump = '<span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />\n        <button type="button" onClick={scrollToUnscheduled} className={`rounded-lg border px-3 py-1.5 text-xs font-black ${unscheduled.length > 0 ? "border-red-300 bg-red-50 text-red-700 shadow-sm hover:bg-red-100" : "border-slate-200 bg-white text-slate-400"}`}>↓ Needs attention ({unscheduled.length})</button>';
replaceOnce(oldJump, newJump);
replaceOnce(interimJump, newJump);

replaceOnce(
  '<div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Unscheduled Queue</div><h2 className="mt-1 text-xl font-black text-slate-950">Work waiting for a calendar slot</h2><p className="mt-1 text-xs font-semibold text-slate-500">Highest-urgency vehicles appear first. Suggested scheduling should normally keep this queue small; outside-partner coordination may leave work here temporarily.</p></div><div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">{unscheduled.length} waiting</div>',
  '<div className="text-xs font-black uppercase tracking-[0.1em] text-blue-600">Needs Scheduling Attention</div><h2 className="mt-1 text-xl font-black text-slate-950">Work Lot Logic cannot currently place</h2><p className="mt-1 text-xs font-semibold text-slate-500">Only work with no scheduled or proposed calendar position appears here. Resolve the reason shown on each item; proposed times stay visible on the calendar while they await confirmation.</p></div><div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">{unscheduled.length} need action</div>',
);

replaceOnce(
  '{!item.partsReadyForExecution ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-900">Waiting on parts</span> : null}',
  '<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">{schedulingAttentionReason(item)}</span>',
);

replaceOnce('>Edit & schedule</button>', '>Resolve & schedule</button>');

replaceOnce(
  'className={`grid gap-3 rounded-xl border p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center ${item.partsReadyForExecution ? "border-slate-200" : "border-amber-300 bg-amber-50/40"}`}',
  'className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"',
);

if (updated !== source) {
  writeFileSync(path, updated, "utf8");
  console.log("Turned the unscheduled list into a true scheduling exception queue and surfaced proposed slots on the calendar.");
} else {
  console.log("Schedule exception queue already aligned.");
}
