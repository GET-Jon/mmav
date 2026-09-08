import { readFileSync, writeFileSync } from "node:fs";

function patchFile(path, patcher, label) {
  let source = readFileSync(path, "utf8");
  const original = source;
  source = patcher(source);
  if (source !== original) {
    writeFileSync(path, source, "utf8");
    console.log(`Aligned ${label} dispatch board.`);
  } else {
    console.log(`${label} dispatch board already aligned.`);
  }
}

function replaceOnce(source, oldText, newText) {
  if (source.includes(newText)) return source;
  if (!source.includes(oldText)) return source;
  return source.replace(oldText, newText);
}

function ownerPatch(source) {
  const helperAnchor = `type VehicleContext = {`;
  const helpers = `function dispatchTime(work: InventoryWorkOrderView) {
  const value = work.scheduledStartAt || work.proposedStartAt;
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function dispatchRank(work: InventoryWorkOrderView) {
  if (work.status === "in_progress") return 0;
  if (["complete", "cancelled"].includes(work.status)) return 4;
  if (work.scheduledStartAt || work.proposedStartAt) return 1;
  if (work.status === "blocked" || Boolean(nextIssue(work))) return 3;
  return 2;
}

function dispatchSort(a: InventoryWorkOrderView, b: InventoryWorkOrderView) {
  const rankDiff = dispatchRank(a) - dispatchRank(b);
  if (rankDiff) return rankDiff;
  const timeDiff = dispatchTime(a) - dispatchTime(b);
  if (Number.isFinite(timeDiff) && timeDiff) return timeDiff;
  return a.title.localeCompare(b.title);
}

${helperAnchor}`;
  if (!source.includes("function dispatchRank(work: InventoryWorkOrderView)")) {
    source = source.replace(helperAnchor, helpers);
  }

  const oldSort = `  const sortedOpenWork = useMemo(() => [...openWork].sort((a, b) => {
    const aRank = stateFor(a).label === "Ready" ? 0 : 1;
    const bRank = stateFor(b).label === "Ready" ? 0 : 1;
    if (aRank !== bRank) return aRank - bRank;
    const at = a.scheduledStartAt || a.proposedStartAt;
    const bt = b.scheduledStartAt || b.proposedStartAt;
    if (!at) return 1;
    if (!bt) return -1;
    return new Date(at).getTime() - new Date(bt).getTime();
  }), [openWork]);`;
  const newSort = `  const sortedOpenWork = useMemo(() => [...openWork].sort(dispatchSort), [openWork]);
  const displayWorkOrders = useMemo(() => [...workOrders].sort(dispatchSort), [workOrders]);`;
  source = replaceOnce(source, oldSort, newSort);
  if (!source.includes("const displayWorkOrders = useMemo")) {
    source = source.replace(
      `  const sortedOpenWork = useMemo(() => [...openWork].sort(dispatchSort), [openWork]);`,
      `  const sortedOpenWork = useMemo(() => [...openWork].sort(dispatchSort), [openWork]);\n  const displayWorkOrders = useMemo(() => [...workOrders].sort(dispatchSort), [workOrders]);`,
    );
  }
  source = source.replace(`{workOrders.map((work, index) => {`, `{displayWorkOrders.map((work, index) => {`);

  const oldIdentity = `<div className="flex flex-wrap items-center gap-2"><span className={\`rounded-full px-2.5 py-1 text-[9px] font-black uppercase \${state.cls}\`}>{state.label}</span><h4 className="text-base font-black">{work.title}</h4></div>
                    {late ? <div className="mt-1 text-xs font-black text-red-700">{late}</div> : null}`;
  const newIdentity = `<div className="flex flex-wrap items-center gap-2">{work.status === "in_progress" ? <span className="rounded-full bg-blue-700 px-2.5 py-1 text-[9px] font-black uppercase text-white">Happening now</span> : <span className={\`rounded-full px-2.5 py-1 text-[9px] font-black uppercase \${state.cls}\`}>{state.label}</span>}<h4 className={\`font-black \${work.status === "in_progress" ? "text-lg text-blue-950" : "text-base"}\`}>{work.title}</h4></div>
                    <div className={\`mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold \${work.status === "in_progress" ? "text-blue-800" : "text-slate-500"}\`}><span>{work.performerName || "Unassigned"}</span><span>{work.status === "in_progress" ? "In progress now" : work.scheduledStartAt || work.proposedStartAt ? dateTimeLabel(work.scheduledStartAt || work.proposedStartAt) : "Unscheduled"}</span></div>
                    {late ? <div className="mt-1 text-xs font-black text-red-700">{late}</div> : null}`;
  source = replaceOnce(source, oldIdentity, newIdentity);

  source = source.replace(
    `<div className="border-b border-slate-200 bg-slate-50 px-5 py-3"><h3 className="text-sm font-black">Execution plan</h3><p className="mt-0.5 text-[11px] text-slate-500">Resolve parts first, then Partner, quote, location, and schedule. Execution unlocks only when every prerequisite is ready.</p></div>`,
    `<div className="border-b border-slate-200 bg-slate-50 px-5 py-3"><h3 className="text-sm font-black">Active Work · Dispatch</h3><p className="mt-0.5 text-[11px] text-slate-500">In-progress work stays first. Scheduled work follows chronologically; unscheduled and waiting work stays below until it is ready.</p></div>`,
  );
  return source;
}

function partnerPatch(source) {
  source = source.replace(`import { useState } from "react";`, `import { useMemo, useState } from "react";`);
  const helperAnchor = `type ScheduleSuggestion = { startAt: string; endAt: string };`;
  const helpers = `function partnerDispatchTime(work: PartnerWorkItem) {
  const value = work.scheduledStartAt || work.proposedStartAt;
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}
function partnerDispatchRank(work: PartnerWorkItem) {
  if (work.status === "in_progress") return 0;
  if (["complete", "cancelled"].includes(work.status)) return 4;
  if (work.scheduledStartAt || work.proposedStartAt) return 1;
  if (work.status === "blocked") return 3;
  return 2;
}
function partnerDispatchSort(a: PartnerWorkItem, b: PartnerWorkItem) {
  const rankDiff = partnerDispatchRank(a) - partnerDispatchRank(b);
  if (rankDiff) return rankDiff;
  const timeDiff = partnerDispatchTime(a) - partnerDispatchTime(b);
  if (Number.isFinite(timeDiff) && timeDiff) return timeDiff;
  return a.title.localeCompare(b.title);
}

${helperAnchor}`;
  if (!source.includes("function partnerDispatchRank(work: PartnerWorkItem)")) {
    source = source.replace(helperAnchor, helpers);
  }
  const stateAnchor = `  const [availabilityText, setAvailabilityText] = useState<Record<string, string>>({});`;
  if (!source.includes("const displayWorkItems = useMemo")) {
    source = source.replace(stateAnchor, `${stateAnchor}\n  const displayWorkItems = useMemo(() => [...workItems].sort(partnerDispatchSort), [workItems]);`);
  }
  source = source.replace(`return <div className="space-y-4">{workItems.map((work) => {`, `return <div className="space-y-4">{displayWorkItems.map((work) => {`);

  const oldHeader = `<div><h2 className="text-xl font-black tracking-[-0.02em]">{work.title}</h2>{work.description ? <p className="mt-1 text-sm text-slate-600">{work.description}</p> : null}</div>`;
  const newHeader = `<div><div className="flex flex-wrap items-center gap-2">{inProgress ? <span className="rounded-full bg-blue-700 px-2.5 py-1 text-[9px] font-black uppercase text-white">Happening now</span> : null}<h2 className={\`font-black tracking-[-0.02em] \${inProgress ? "text-2xl text-blue-950" : "text-xl"}\`}>{work.title}</h2></div><div className={\`mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm font-bold \${inProgress ? "text-blue-800" : "text-slate-500"}\`}><span>{work.vehicleLabel}</span><span>{inProgress ? "In progress now" : work.scheduledStartAt || work.proposedStartAt ? dateTime(work.scheduledStartAt || work.proposedStartAt) : "Unscheduled"}</span></div>{work.description ? <p className="mt-1 text-sm text-slate-600">{work.description}</p> : null}</div>`;
  source = replaceOnce(source, oldHeader, newHeader);

  source = source.replace(
    `<section key={work.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">`,
    `<section key={work.id} className={\`overflow-hidden rounded-2xl border bg-white shadow-sm \${inProgress ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200"}\`}>`,
  );
  return source;
}

patchFile("components/mindful-inventory/inventory-active-work-v6.tsx", ownerPatch, "Owner Active Work");
patchFile("components/partner/partner-work-list-v4.tsx", partnerPatch, "Partner Active Work");
