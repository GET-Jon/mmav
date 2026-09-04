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

  const oldHeader = `          <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">\n            <div>\n              <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Mechanical Inspection</div>\n              <h2 className="mt-1 text-xl font-black text-slate-950">Scope Validation</h2>\n              <p className="mt-1 max-w-2xl text-sm text-slate-500">Confirm the preliminary issues and requested upgrades before the Work Plan is built.</p>\n            </div>\n            <span className={\`rounded-full px-3 py-1.5 text-xs font-black \${reconciliation.pending > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}\`}>\n              {reconciliation.pending > 0 ? \`${reconciliation.pending} needs review\` : "Scope validated"}\n            </span>\n          </div>`;
  const newHeader = `          <div className="border-b border-slate-100 pb-3">\n            <h2 className="text-xl font-black text-slate-950">Scope Validation</h2>\n          </div>`;
  if (updated.includes(oldHeader)) updated = updated.replace(oldHeader, newHeader);

  const oldKnown = `          <div className="mt-5">\n            <div className="flex items-start justify-between gap-3">\n              <div>\n                <h3 className="font-black text-slate-950">Known Issues</h3>\n                <p className="mt-1 text-sm text-slate-500">Confirm whether each Lot Logic issue is actually present.</p>\n              </div>\n              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{aiFindings.length}</span>\n            </div>`;
  if (updated.includes(oldKnown)) updated = updated.replace(oldKnown, `          <div className="mt-4">`);

  const oldUpgrades = `          <div className="mt-6 border-t border-slate-100 pt-5">\n            <div className="flex items-start justify-between gap-3">\n              <div>\n                <h3 className="font-black text-slate-950">Requested Upgrades</h3>\n                <p className="mt-1 text-sm text-slate-500">Validate build intent with the same priority as the known scope.</p>\n              </div>\n              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{proposedUpgrades.length}</span>\n            </div>`;
  if (updated.includes(oldUpgrades)) updated = updated.replace(oldUpgrades, `          <div className="mt-5 border-t border-slate-100 pt-4">`);

  return updated;
});

const assignmentPath = "components/mindful-inventory/mechanical-inspector-assignment.tsx";
const assignmentChanged = updateFile(assignmentPath, (source) => {
  let updated = source;

  const oldAvailability = `function availableAt(option: MechanicalInspectorOption, localStart: string) {\n  if (!localStart) return true;\n  const start = new Date(localStart); if (!Number.isFinite(start.getTime())) return true;\n  const durationHours = Math.max(option.typicalDurationHours || 1.5, 0.25);\n  const end = new Date(start.getTime() + durationHours * 3600000);\n  const hours = option.standardHours?.[dayKeys[start.getDay()]];\n  if (hours) {\n    if (!hours.enabled) return false;\n    const startMinutes = start.getHours() * 60 + start.getMinutes(); const endMinutes = end.getHours() * 60 + end.getMinutes();\n    if (startMinutes < minutes(hours.start) || endMinutes > minutes(hours.end) || start.toDateString() !== end.toDateString()) return false;\n  }\n  return !option.busySlots.some((slot) => start.getTime() < new Date(slot.endAt).getTime() && end.getTime() > new Date(slot.startAt).getTime());\n}`;
  const newAvailability = `type AvailabilityState = "available" | "outside_hours" | "conflict";\nfunction availabilityState(option: MechanicalInspectorOption, localStart: string): AvailabilityState {\n  if (!localStart) return "available";\n  const start = new Date(localStart); if (!Number.isFinite(start.getTime())) return "available";\n  const durationHours = Math.max(option.typicalDurationHours || 1.5, 0.25);\n  const end = new Date(start.getTime() + durationHours * 3600000);\n  const hours = option.standardHours?.[dayKeys[start.getDay()]];\n  if (hours) {\n    if (!hours.enabled) return "outside_hours";\n    const startMinutes = start.getHours() * 60 + start.getMinutes(); const endMinutes = end.getHours() * 60 + end.getMinutes();\n    if (startMinutes < minutes(hours.start) || endMinutes > minutes(hours.end) || start.toDateString() !== end.toDateString()) return "outside_hours";\n  }\n  return option.busySlots.some((slot) => start.getTime() < new Date(slot.endAt).getTime() && end.getTime() > new Date(slot.startAt).getTime()) ? "conflict" : "available";\n}\nfunction availableAt(option: MechanicalInspectorOption, localStart: string) {\n  return availabilityState(option, localStart) === "available";\n}`;
  if (updated.includes(oldAvailability)) updated = updated.replace(oldAvailability, newAvailability);

  updated = updated.replace(
    `      {customTimeOpen ? <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">`,
    `      {customTimeOpen ? <div className="mt-3 inline-flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">`,
  );
  updated = updated.replace(
    `        <input type="datetime-local" step="900" value={requestedStartAt} onChange={(e) => setRequestedStartAt(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" />`,
    `        <input type="datetime-local" step="900" value={requestedStartAt} onChange={(e) => setRequestedStartAt(e.target.value)} className="w-[460px] max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" />`,
  );
  const oldStatus = `{selected && requestedStartAt ? <span className={\`text-xs font-bold \${availableAt(selected, requestedStartAt) ? "text-emerald-700" : "text-red-700"}\`}>{availableAt(selected, requestedStartAt) ? "Available" : "Schedule conflict"}</span> : null}`;
  const newStatus = `{selected && requestedStartAt ? (() => { const state = availabilityState(selected, requestedStartAt); return <span className={\`text-xs font-bold \${state === "available" ? "text-emerald-700" : "text-red-700"}\`}>{state === "available" ? "Available" : state === "outside_hours" ? "Outside standard hours" : "Schedule conflict"}</span>; })() : null}`;
  if (updated.includes(oldStatus)) updated = updated.replace(oldStatus, newStatus);

  return updated;
});

if (inspectionChanged) console.log("Simplified Mechanical Inspection scope hierarchy.");
if (assignmentChanged) console.log("Refined Mechanical inspector custom scheduling UX.");
