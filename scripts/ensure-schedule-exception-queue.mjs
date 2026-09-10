import { readFileSync, writeFileSync } from "node:fs";

const path = "components/mindful-inventory/inventory-schedule-board.tsx";
const source = readFileSync(path, "utf8");
let updated = source;

function replaceOnce(before, after) {
  if (updated.includes(before)) updated = updated.replace(before, after);
}

if (!updated.includes("function planningStart(item: InventoryScheduleWork)")) {
  replaceOnce(
    `function performerKey(item: InventoryScheduleWork) {
  if (item.assignedPartnerId) return \`partner:${item.assignedPartnerId}\`;
  if (item.assignedUserId) return \`user:${item.assignedUserId}\`;
  return "unassigned";
}
`,
    `function performerKey(item: InventoryScheduleWork) {
  if (item.assignedPartnerId) return \`partner:${item.assignedPartnerId}\`;
  if (item.assignedUserId) return \`user:${item.assignedUserId}\`;
  return "unassigned";
}
function planningStart(item: InventoryScheduleWork) {
  return item.scheduledStartAt || item.proposedStartAt || null;
}
function planningEnd(item: InventoryScheduleWork) {
  return item.scheduledEndAt || item.proposedEndAt || null;
}
function isProposed(item: InventoryScheduleWork) {
  return !item.scheduledStartAt && Boolean(item.proposedStartAt);
}
function schedulingAttentionReason(item: InventoryScheduleWork) {
  if (!item.performerName) return "No assignee selected";
  if (!item.locationId) return "No location selected";
  return "No calendar slot selected";
}
`,
  );
}

replaceOnce(
  `function overlaps(a: InventoryScheduleWork, b: InventoryScheduleWork) {
  if (!a.scheduledStartAt || !a.scheduledEndAt || !b.scheduledStartAt || !b.scheduledEndAt) return false;
  return new Date(a.scheduledStartAt).getTime() < new Date(b.scheduledEndAt).getTime()
    && new Date(a.scheduledEndAt).getTime() > new Date(b.scheduledStartAt).getTime();
}`,
  `function overlaps(a: InventoryScheduleWork, b: InventoryScheduleWork) {
  const aStart = planningStart(a);
  const aEnd = planningEnd(a);
  const bStart = planningStart(b);
  const bEnd = planningEnd(b);
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return new Date(aStart).getTime() < new Date(bEnd).getTime()
    && new Date(aEnd).getTime() > new Date(bStart).getTime();
}`,
);

replaceOnce(
  `  const unscheduled = active.filter((item) => !item.scheduledStartAt).sort((a, b) => Number(a.vehiclePriority) - Number(b.vehiclePriority));`,
  `  const unscheduled = active.filter((item) => !planningStart(item)).sort((a, b) => Number(a.vehiclePriority) - Number(b.vehiclePriority));`,
);

replaceOnce(
  `    const scheduledActive = scheduleWork.filter((item) => item.status !== "complete" && item.status !== "cancelled" && item.scheduledStartAt && item.scheduledEndAt);`,
  `    const scheduledActive = scheduleWork.filter((item) => item.status !== "complete" && item.status !== "cancelled" && planningStart(item) && planningEnd(item));`,
);

replaceOnce(
  `    if (!item.scheduledStartAt || item.status === "cancelled") return false;
    const when = new Date(item.scheduledStartAt).getTime();`,
  `    const plannedStart = planningStart(item);
    if (!plannedStart || item.status === "cancelled") return false;
    const when = new Date(plannedStart).getTime();`,
);

replaceOnce(
  `    const elapsed = item.elapsedMinutes ?? item.legacyDurationMinutes;
    const itemConflicts = conflictsByItem.get(item.id) || [];`,
  `    const elapsed = item.elapsedMinutes ?? item.legacyDurationMinutes;
    const planStart = planningStart(item);
    const proposed = isProposed(item);
    const itemConflicts = conflictsByItem.get(item.id) || [];`,
);

replaceOnce(
  `              : missing
                  ? "border-amber-300 hover:border-amber-500"
                  : "border-slate-200 hover:border-slate-400";`,
  `              : missing
                  ? "border-amber-300 hover:border-amber-500"
                  : proposed
                    ? "border-blue-300 border-dashed bg-blue-50/30 hover:border-blue-500"
                    : "border-slate-200 hover:border-slate-400";`,
);

replaceOnce(
  `{item.scheduledStartAt ? new Date(item.scheduledStartAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "Unscheduled"}`,
  `{planStart ? new Date(planStart).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "Needs scheduling"}`,
);

replaceOnce(
  `{complete ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-500">Complete</span> : null}`,
  `{complete ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-500">Complete</span> : null}
          {!complete && proposed ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-black uppercase text-blue-700">Proposed</span> : null}`,
);

replaceOnce(
  `          const items = weekWork.filter((item) => item.scheduledStartAt && dayKey(new Date(item.scheduledStartAt)) === dayKey(day) && visible(item));`,
  `          const items = weekWork.filter((item) => { const start = planningStart(item); return start && dayKey(new Date(start)) === dayKey(day) && visible(item); });`,
);

updated = updated.replaceAll(
  `new Date(a.scheduledStartAt || 0).getTime() - new Date(b.scheduledStartAt || 0).getTime()`,
  `new Date(planningStart(a) || 0).getTime() - new Date(planningStart(b) || 0).getTime()`,
);

const oldJump = `<button type="button" onClick={scrollToUnscheduled} className={\`rounded-full px-3 py-1.5 text-xs font-black ${unscheduled.length > 0 ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : "bg-slate-100 text-slate-500"}\`}>Unscheduled ({unscheduled.length})</button>`;
const newJump = `<span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />
        <button type="button" onClick={scrollToUnscheduled} className={\`rounded-lg border px-3 py-1.5 text-xs font-black ${unscheduled.length > 0 ? "border-blue-300 bg-white text-blue-700 shadow-sm hover:bg-blue-50" : "border-slate-200 bg-white text-slate-400"}\`}>↓ Needs scheduling ({unscheduled.length})</button>`;
replaceOnce(oldJump, newJump);

replaceOnce(
  `<div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Unscheduled Queue</div><h2 className="mt-1 text-xl font-black text-slate-950">Work waiting for a calendar slot</h2><p className="mt-1 text-xs font-semibold text-slate-500">Highest-urgency vehicles appear first. Suggested scheduling should normally keep this queue small; outside-partner coordination may leave work here temporarily.</p></div><div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">{unscheduled.length} waiting</div>`,
  `<div className="text-xs font-black uppercase tracking-[0.1em] text-blue-600">Needs Scheduling Attention</div><h2 className="mt-1 text-xl font-black text-slate-950">Work Lot Logic cannot currently place</h2><p className="mt-1 text-xs font-semibold text-slate-500">Only work with no scheduled or proposed calendar position appears here. Resolve the reason shown on each item; proposed times stay visible on the calendar while they await confirmation.</p></div><div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">{unscheduled.length} need action</div>`,
);

replaceOnce(
  `{!item.partsReadyForExecution ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-900">Waiting on parts</span> : null}`,
  `<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">{schedulingAttentionReason(item)}</span>`,
);

replaceOnce(
  `>Edit & schedule</button>`,
  `>Resolve & schedule</button>`,
);

replaceOnce(
  `className={\`grid gap-3 rounded-xl border p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center ${item.partsReadyForExecution ? "border-slate-200" : "border-amber-300 bg-amber-50/40"}\`}`,
  `className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"`,
);

if (updated !== source) {
  writeFileSync(path, updated, "utf8");
  console.log("Turned the unscheduled list into a true scheduling exception queue and surfaced proposed slots on the calendar.");
} else {
  console.log("Schedule exception queue already aligned.");
}
