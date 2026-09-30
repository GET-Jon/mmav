import { readFileSync, writeFileSync } from "node:fs";

const componentPath = "components/partner/partner-inspection-list.tsx";
let component = readFileSync(componentPath, "utf8");
let componentChanged = false;

const assignedOld = '{item.status === "assigned" ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4"><div><div className="font-black">New inspection assignment</div><div className="mt-1 text-sm text-slate-600">Requested {when(item.requestedStartAt)}</div></div><button disabled={working === item.id} onClick={() => void act(item, { action: "confirm", durationHours: typicalDurationHours || 1.5 })} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Confirm Inspection</button></div> : null}';
const assignedNew = '{item.status === "assigned" ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4"><div><div className="font-black">Inspection ready</div><div className="mt-1 text-sm text-slate-600">Scheduled for {when(item.requestedStartAt)}. Begin when you are ready to inspect the vehicle.</div></div><button disabled={working === item.id} onClick={() => void act(item, { action: "start", durationHours: typicalDurationHours || 1.5 })} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Begin Inspection</button></div> : null}';

if (!component.includes(assignedNew)) {
  if (!component.includes(assignedOld)) throw new Error("Could not find assigned inspection confirmation UI.");
  component = component.replace(assignedOld, assignedNew);
  componentChanged = true;
}

const confirmedOld = '{item.status === "confirmed" ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div><div className="font-black">Scheduled</div><div className="mt-1 text-sm text-slate-600">{when(item.scheduledStartAt)}</div></div><button disabled={working === item.id} onClick={() => void act(item, { action: "start" })} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Start Inspection</button></div> : null}';
const confirmedNew = '{item.status === "confirmed" ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div><div className="font-black">Inspection ready</div><div className="mt-1 text-sm text-slate-600">Scheduled for {when(item.scheduledStartAt || item.requestedStartAt)}. Begin when you are ready to inspect the vehicle.</div></div><button disabled={working === item.id} onClick={() => void act(item, { action: "start", durationHours: typicalDurationHours || 1.5 })} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Begin Inspection</button></div> : null}';

if (!component.includes(confirmedNew)) {
  if (!component.includes(confirmedOld)) throw new Error("Could not find confirmed inspection start UI.");
  component = component.replace(confirmedOld, confirmedNew);
  componentChanged = true;
}

if (componentChanged) {
  writeFileSync(componentPath, component, "utf8");
  console.log("Simplified partner inspection assignment into a single Begin Inspection action.");
}

const routePath = "app/api/partner/inspections/[inspectionId]/route.ts";
let route = readFileSync(routePath, "utf8");

const startOld = `    } else if (action === "start") {\n      if (!["confirmed", "revision_requested"].includes(inspection.status)) return NextResponse.json({ error: "Confirm the inspection before starting it." }, { status: 409 });\n      const { error } = await admin.from("mindful_inventory_inspections").update({ status: "in_progress", started_at: now, revision_notes: null, updated_at: now }).eq("id", inspection.id);\n      if (error) throw new Error(error.message);`;
const startNew = `    } else if (action === "start") {\n      if (!["assigned", "confirmed", "revision_requested"].includes(inspection.status)) return NextResponse.json({ error: "This inspection cannot be started from its current status." }, { status: 409 });\n      const durationHours = Number(body.durationHours || 1.5);\n      const scheduledStartAt = inspection.requested_start_at || now;\n      const scheduledEndAt = new Date(new Date(scheduledStartAt).getTime() + Math.max(durationHours, 0.25) * 3600000).toISOString();\n      const { error } = await admin.from("mindful_inventory_inspections").update({\n        status: "in_progress",\n        partner_confirmation_status: "confirmed",\n        scheduled_start_at: scheduledStartAt,\n        scheduled_end_at: scheduledEndAt,\n        started_at: now,\n        revision_notes: null,\n        updated_at: now,\n      }).eq("id", inspection.id);\n      if (error) throw new Error(error.message);`;

if (!route.includes(startNew)) {
  if (!route.includes(startOld)) throw new Error("Could not find partner inspection start transition.");
  route = route.replace(startOld, startNew);
  writeFileSync(routePath, route, "utf8");
  console.log("Allowed assigned inspections to begin directly without a separate confirmation step.");
}
