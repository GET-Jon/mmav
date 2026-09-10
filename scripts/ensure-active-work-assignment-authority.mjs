import { readFileSync, writeFileSync } from "node:fs";

const componentPath = "components/mindful-inventory/inventory-active-work-v6.tsx";
let source = readFileSync(componentPath, "utf8");
const original = source;

// Completed setup stays visually completed even while its editor is open.
source = source.replace(
  '${selected ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100" : active ? "border-blue-300 bg-blue-50" : done ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white"}',
  '${done ? `border-emerald-200 bg-emerald-50/60${selected ? " ring-2 ring-blue-100" : ""}` : selected ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100" : active ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}',
);
source = source.replace(
  '${active ? "text-blue-800" : done ? "text-emerald-800" : "text-slate-500"}',
  '${done ? "text-emerald-800" : active ? "text-blue-800" : "text-slate-500"}',
);

// A confirmed schedule is resolved/green. A proposal is blue only while awaiting confirmation.
source = source.replaceAll(
  'active={Boolean(work.proposedStartAt) || scheduleActive}',
  'active={!work.scheduledStartAt && (Boolean(work.proposedStartAt) || scheduleActive)}',
);

// "Partner" was overloaded: internal Mindful staff and external vendors are both assignees.
source = source.replaceAll('label="Partner"', 'label="Assigned To"');
source = source.replaceAll('>2 · Partner</div>', '>2 · Assigned To</div>');
source = source.replaceAll('"Change partner"', '"Change assignee"');
source = source.replaceAll('"Partner updated."', '"Assignee updated."');
source = source.replaceAll('>Choose Partner</option>', '>Choose assignee</option>');
source = source.replaceAll('return "Choose a Partner";', 'return "Choose an assignee";');
source = source.replaceAll('label: "Needs Partner"', 'label: "Needs Assignee"');

// Make the assignment type explicit without duplicating external company names already in performerName.
source = source.replaceAll(
  'detail={work.performerName || "Unassigned"}',
  'detail={work.performerName ? `${work.performerName}${work.assignedPartnerId ? "" : " · Mindful"}` : "Unassigned"}',
);

// The dispatch group already says Happening Now; do not repeat the same badge on the item itself.
source = source.replace(
  '<div className="flex flex-wrap items-center gap-2">{work.status === "in_progress" ? <span className="rounded-full bg-blue-700 px-2.5 py-1 text-[9px] font-black uppercase text-white">Happening now</span> : <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${state.cls}`}>{state.label}</span>}<h4 className={`font-black ${work.status === "in_progress" ? "text-lg text-blue-950" : "text-base"}`}>{work.title}</h4></div>',
  '<div className="flex flex-wrap items-center gap-2">{work.status !== "in_progress" ? <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${state.cls}`}>{state.label}</span> : null}<h4 className={`font-black ${work.status === "in_progress" ? "text-lg text-blue-950" : "text-base"}`}>{work.title}</h4></div>',
);

// Owner is the normal operator for internal Mindful work. External partners remain the
// primary operator, but the Owner always has a clearly-labelled fallback so operations
// cannot stall when a partner is not using the portal.
if (!source.includes('ownerStatusOverrideId, setOwnerStatusOverrideId')) {
  source = source.replace(
    '  const [partsWorkOrderId, setPartsWorkOrderId] = useState<string | null>(null);',
    '  const [partsWorkOrderId, setPartsWorkOrderId] = useState<string | null>(null);\n  const [ownerStatusOverrideId, setOwnerStatusOverrideId] = useState<string | null>(null);',
  );
}

source = source.replaceAll(
  'const canStart = !done && work.status !== "in_progress" && !issue;',
  'const canStart = !done && work.status !== "in_progress" && !issue && !work.assignedPartnerId;',
);
source = source.replaceAll(
  'const canStart = !done && work.status !== "in_progress" && !issue && !work.assignedPartnerId;',
  'const canStart = !done && work.status !== "in_progress" && !issue && !work.assignedPartnerId;',
);

source = source.replace(
  '{work.status === "in_progress" ? <button disabled={workingId === work.id} onClick={() => void patchWork(work.id, { status: "complete" }, "Work completed.")} className="flex-1 rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">Complete</button> : null}\n                    {canStart ? <button disabled={workingId === work.id} onClick={() => void patchWork(work.id, { status: "in_progress" }, "Work started.")} className="flex-1 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-black text-white">Start Work</button> : null}\n                    {!done && work.status !== "in_progress" && !canStart ? <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center text-[10px] font-black text-slate-500">{work.assignedPartnerId && !issue ? "Partner starts work" : "Complete setup first"}</div> : null}',
  '{work.status === "in_progress" && !work.assignedPartnerId ? <button disabled={workingId === work.id} onClick={() => void patchWork(work.id, { status: "complete" }, "Work completed.")} className="flex-1 rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">Complete</button> : null}\n                    {canStart ? <button disabled={workingId === work.id} onClick={() => void patchWork(work.id, { status: "in_progress" }, "Work started.")} className="flex-1 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-black text-white">Start Work</button> : null}\n                    {!done && work.assignedPartnerId && (work.status === "in_progress" || !issue) ? <button type="button" onClick={() => setOwnerStatusOverrideId((current) => current === work.id ? null : work.id)} className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:border-slate-500">Update status</button> : null}\n                    {!done && work.status !== "in_progress" && !canStart && !(work.assignedPartnerId && !issue) ? <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center text-[10px] font-black text-slate-500">Complete setup first</div> : null}',
);

// Fallback for source variants that still have the older external-partner placeholder.
source = source.replace(
  '>{work.assignedPartnerId && !issue ? "Partner starts work" : "Complete setup first"}</div> : null}',
  '>Complete setup first</div> : null}',
);

if (!source.includes('Owner fallback · partner remains primary operator')) {
  source = source.replace(
    '                {rowMessage ? <div className={`mt-3 rounded-lg border px-3 py-2 text-xs font-bold ${rowMessage.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{rowMessage.text}</div> : null}',
    '                {ownerStatusOverrideId === work.id && work.assignedPartnerId && !done ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3"><div className="text-[9px] font-black uppercase tracking-[0.08em] text-amber-700">Owner fallback · partner remains primary operator</div><div className="mt-1 text-xs font-semibold text-amber-900">Use this only when {work.performerName || "the assigned partner"} is doing the work but has not updated Lot Logic. The Owner action will be recorded in History.</div><div className="mt-3 flex flex-wrap gap-2">{work.status === "in_progress" ? <button disabled={workingId === work.id} onClick={() => { if (window.confirm(`Mark this work complete on behalf of ${work.performerName || "the assigned partner"}? This Owner override will be recorded in History.`)) void patchWork(work.id, { status: "complete", ownerOverride: true }, `Work marked complete on behalf of ${work.performerName || "the assigned partner"}.`); }} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">Mark complete on behalf of Partner</button> : <button disabled={workingId === work.id} onClick={() => { if (window.confirm(`Mark this work started on behalf of ${work.performerName || "the assigned partner"}? This Owner override will be recorded in History.`)) void patchWork(work.id, { status: "in_progress", ownerOverride: true }, `Work marked started on behalf of ${work.performerName || "the assigned partner"}.`); }} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white">Mark started on behalf of Partner</button>}<button type="button" onClick={() => setOwnerStatusOverrideId(null)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-900">Cancel</button></div></div> : null}\n                {rowMessage ? <div className={`mt-3 rounded-lg border px-3 py-2 text-xs font-bold ${rowMessage.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{rowMessage.text}</div> : null}',
  );
}

if (source !== original) {
  writeFileSync(componentPath, source, "utf8");
  console.log("Aligned Active Work assignee labels, confirmed schedule state, and Owner fallback status controls.");
} else {
  console.log("Active Work assignment authority already aligned.");
}

// Server-side authority: external partners still own their normal Start/Complete actions,
// but an explicit Owner fallback is allowed and auditable.
const routePath = "app/api/mindful/inventory/work-orders/[workOrderId]/route.ts";
let route = readFileSync(routePath, "utf8");
const originalRoute = route;

if (!route.includes('const ownerOverride = body.ownerOverride === true;')) {
  route = route.replace(
    '    const requestedStatus = body.status === undefined ? null : String(body.status || "").trim();',
    '    const requestedStatus = body.status === undefined ? null : String(body.status || "").trim();\n    const ownerOverride = body.ownerOverride === true;',
  );
}
route = route.replace(
  '      if (existing.assigned_partner_id) {\n        return NextResponse.json({ error: "External Partner work must be started by the assigned Partner." }, { status: 403 });\n      }',
  '      if (existing.assigned_partner_id && !ownerOverride) {\n        return NextResponse.json({ error: "External Partner work must normally be started by the assigned Partner. Use the Owner fallback explicitly if needed." }, { status: 403 });\n      }',
);
if (!route.includes('External Partner work must normally be completed by the assigned Partner')) {
  route = route.replace(
    '    if (requestedStatus === "in_progress") {',
    '    if (requestedStatus === "complete" && existing.assigned_partner_id && !ownerOverride) {\n      return NextResponse.json({ error: "External Partner work must normally be completed by the assigned Partner. Use the Owner fallback explicitly if needed." }, { status: 403 });\n    }\n\n    if (requestedStatus === "in_progress") {',
  );
}
route = route.replace(
  '        summary: requestedStatus === "complete" ? "Work Order completed." : `Work Order moved to ${requestedStatus.replaceAll("_", " ")}.`,\n        metadata: { previousStatus: existing.status, status: requestedStatus },',
  '        summary: ownerOverride && existing.assigned_partner_id\n          ? requestedStatus === "complete"\n            ? "Owner marked Work Order complete on behalf of the assigned Partner."\n            : requestedStatus === "in_progress"\n              ? "Owner marked Work Order started on behalf of the assigned Partner."\n              : `Owner updated Work Order status on behalf of the assigned Partner to ${requestedStatus.replaceAll("_", " ")}.`\n          : requestedStatus === "complete" ? "Work Order completed." : `Work Order moved to ${requestedStatus.replaceAll("_", " ")}.`,\n        metadata: { previousStatus: existing.status, status: requestedStatus, ownerOverride: ownerOverride && Boolean(existing.assigned_partner_id), actedOnBehalfOfPartnerId: ownerOverride ? existing.assigned_partner_id : null },',
);

if (route !== originalRoute) {
  writeFileSync(routePath, route, "utf8");
  console.log("Enabled auditable Owner fallback for external Partner status updates.");
} else {
  console.log("Owner fallback API authority already aligned.");
}
