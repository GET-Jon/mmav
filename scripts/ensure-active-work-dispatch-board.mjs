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

function dispatchGroupLabel(work: InventoryWorkOrderView) {
  const rank = dispatchRank(work);
  if (rank === 0) return "Happening now";
  if (rank === 1) return "Scheduled";
  if (rank === 2) return "Unscheduled";
  if (rank === 3) return "Waiting / needs action";
  return "Completed / inactive";
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
  } else if (!source.includes("function dispatchGroupLabel(work: InventoryWorkOrderView)")) {
    source = source.replace(
      `function dispatchSort(a: InventoryWorkOrderView, b: InventoryWorkOrderView) {`,
      `function dispatchGroupLabel(work: InventoryWorkOrderView) {\n  const rank = dispatchRank(work);\n  if (rank === 0) return "Happening now";\n  if (rank === 1) return "Scheduled";\n  if (rank === 2) return "Unscheduled";\n  if (rank === 3) return "Waiting / needs action";\n  return "Completed / inactive";\n}\n\nfunction dispatchSort(a: InventoryWorkOrderView, b: InventoryWorkOrderView) {`,
    );
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

  if (!source.includes("const nextScheduledWork =")) {
    source = source.replace(
      `  const behindScheduleWork = sortedOpenWork.find((work) => Boolean(behindScheduleLabel(work))) || null;\n  const inProgressWork = sortedOpenWork.find((work) => work.status === "in_progress") || null;`,
      `  const behindScheduleWork = sortedOpenWork.find((work) => Boolean(behindScheduleLabel(work))) || null;\n  const inProgressWork = sortedOpenWork.find((work) => work.status === "in_progress") || null;\n  const nextScheduledWork = sortedOpenWork.find((work) => work.status !== "in_progress" && Boolean(work.scheduledStartAt || work.proposedStartAt)) || null;\n  const attentionWork = sortedOpenWork.find((work) => Boolean(nextIssue(work))) || null;`,
    );
  }

  source = source.replace(`{workOrders.map((work, index) => {`, `{displayWorkOrders.map((work, index) => {`);

  const oldIdentity = `<div className="flex flex-wrap items-center gap-2"><span className={\`rounded-full px-2.5 py-1 text-[9px] font-black uppercase \${state.cls}\`}>{state.label}</span><h4 className="text-base font-black">{work.title}</h4></div>
                    {late ? <div className="mt-1 text-xs font-black text-red-700">{late}</div> : null}`;
  const newIdentity = `<div className="flex flex-wrap items-center gap-2">{work.status === "in_progress" ? <span className="rounded-full bg-blue-700 px-2.5 py-1 text-[9px] font-black uppercase text-white">Happening now</span> : <span className={\`rounded-full px-2.5 py-1 text-[9px] font-black uppercase \${state.cls}\`}>{state.label}</span>}<h4 className={\`font-black \${work.status === "in_progress" ? "text-lg text-blue-950" : "text-base"}\`}>{work.title}</h4></div>
                    <div className={\`mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold \${work.status === "in_progress" ? "text-blue-800" : "text-slate-500"}\`}><span>{work.performerName || "Unassigned"}</span><span>{work.status === "in_progress" ? "In progress now" : work.scheduledStartAt || work.proposedStartAt ? dateTimeLabel(work.scheduledStartAt || work.proposedStartAt) : "Unscheduled"}</span></div>
                    {late ? <div className="mt-1 text-xs font-black text-red-700">{late}</div> : null}`;
  source = replaceOnce(source, oldIdentity, newIdentity);

  const overviewStart = source.indexOf(`      <section className={\`rounded-2xl border bg-white p-4 shadow-sm`);
  const executionStart = source.indexOf(`      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">`);
  if (overviewStart !== -1 && executionStart !== -1 && overviewStart < executionStart && !source.includes("Dispatch overview")) {
    const compactOverview = `      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Dispatch overview</div>
            <h2 className="mt-1 text-lg font-black">Who is doing what, and what comes next</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">{completed}/{workOrders.length} complete</span>
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">{hours(totalLabor)} labor</span>
            <span className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-black text-white">{money(activeBudget)} budget</span>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className={\`rounded-xl border p-3 \${inProgressWork ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50"}\`}>
            <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Happening now</div>
            {inProgressWork ? <><div className="mt-1 text-sm font-black text-blue-950">{inProgressWork.title}</div><div className="mt-1 text-xs font-bold text-blue-800">{inProgressWork.performerName || "Unassigned"} · In progress now</div></> : <div className="mt-1 text-sm font-bold text-slate-500">No work in progress</div>}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Up next</div>
            {nextScheduledWork ? <><div className="mt-1 text-sm font-black">{nextScheduledWork.title}</div><div className="mt-1 text-xs font-bold text-slate-600">{nextScheduledWork.performerName || "Unassigned"} · {dateTimeLabel(nextScheduledWork.scheduledStartAt || nextScheduledWork.proposedStartAt)}</div></> : <div className="mt-1 text-sm font-bold text-slate-500">Nothing scheduled</div>}
          </div>
          <div className={\`rounded-xl border p-3 \${actionCount ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"}\`}>
            <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Needs attention</div>
            {attentionWork ? <><div className="mt-1 text-sm font-black">{attentionWork.title}</div><div className="mt-1 text-xs font-bold text-amber-800">{nextIssue(attentionWork)}</div>{actionCount > 1 ? <div className="mt-1 text-[10px] font-bold text-amber-700">+ {actionCount - 1} more needing setup</div> : null}</> : <div className="mt-1 text-sm font-bold text-emerald-700">No setup blockers</div>}
          </div>
        </div>
      </section>

`;
    source = source.slice(0, overviewStart) + compactOverview + source.slice(executionStart);
  }

  source = source.replace(
    `<div className="border-b border-slate-200 bg-slate-50 px-5 py-3"><h3 className="text-sm font-black">Execution plan</h3><p className="mt-0.5 text-[11px] text-slate-500">Resolve parts first, then Partner, quote, location, and schedule. Execution unlocks only when every prerequisite is ready.</p></div>`,
    `<div className="border-b border-slate-200 bg-slate-50 px-5 py-3"><h3 className="text-sm font-black">Active Work · Dispatch</h3><p className="mt-0.5 text-[11px] text-slate-500">Stable order: work happening now first, then scheduled work by date, then unscheduled or waiting work. Expand a row only when you need setup details.</p></div>`,
  );

  if (!source.includes("const showDispatchGroup =")) {
    source = source.replace(
      `            const canStart = !done && work.status !== "in_progress" && !issue;`,
      `            const canStart = !done && work.status !== "in_progress" && !issue;\n            const previousWork = index > 0 ? displayWorkOrders[index - 1] : null;\n            const showDispatchGroup = !previousWork || dispatchRank(previousWork) !== dispatchRank(work);\n            const dispatchGroup = dispatchGroupLabel(work);`,
    );
  }

  source = source.replace(
    `<article key={work.id} className={\`relative ml-4 py-5 pr-5 sm:ml-6 sm:pr-6 \${index ? "border-t border-slate-200" : ""} \${done ? "bg-slate-50/70" : ""}\`}>`,
    `<article key={work.id} className={\`relative ml-4 py-5 pr-5 sm:ml-6 sm:pr-6 \${index ? "border-t border-slate-200" : ""} \${done ? "bg-slate-50/70" : ""} \${work.status === "in_progress" ? "bg-blue-50/70" : ""}\`}>
                {showDispatchGroup ? <div className="mb-3 flex items-center gap-2"><span className={\`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] \${dispatchRank(work) === 0 ? "bg-blue-700 text-white" : dispatchRank(work) === 1 ? "bg-slate-900 text-white" : dispatchRank(work) === 3 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}\`}>{dispatchGroup}</span><div className="h-px flex-1 bg-slate-200" /></div> : null}`,
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

function ownerPagePatch(source) {
  const partnerStart = source.indexOf(`    <section className={\`rounded-2xl border px-4 py-3`);
  const partnerEndMarker = `    </section>\n\n    {behindSchedule.length ?`;
  const partnerEnd = source.indexOf(partnerEndMarker, partnerStart);
  if (partnerStart !== -1 && partnerEnd !== -1 && !source.includes("{latestPartnerChange ? <section")) {
    const oldBlock = source.slice(partnerStart, partnerEnd + `    </section>\n\n`.length);
    const innerStart = oldBlock.indexOf(`      {latestPartnerChange ? <>`);
    const innerEnd = oldBlock.lastIndexOf(`      </> : <div className="mt-1 text-xs font-bold text-emerald-800">All going to plan · No partner schedule changes have been reported.</div>}`);
    if (innerStart !== -1 && innerEnd !== -1) {
      const inner = oldBlock.slice(innerStart + `      {latestPartnerChange ? <>`.length, innerEnd);
      const newBlock = `    {latestPartnerChange ? <section className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">\n      <div className="text-[10px] font-black uppercase tracking-[0.1em] text-blue-700">Partner update</div>\n      <>${inner}</>\n    </section> : null}\n\n`;
      source = source.replace(oldBlock, newBlock);
    }
  }

  const lateStart = source.indexOf(`    {behindSchedule.length ? <section`);
  const activeStart = source.indexOf(`    <InventoryActiveWork`, lateStart);
  if (lateStart !== -1 && activeStart !== -1) {
    source = source.slice(0, lateStart) + source.slice(activeStart);
  }
  return source;
}

patchFile("components/mindful-inventory/inventory-active-work-v6.tsx", ownerPatch, "Owner Active Work");
patchFile("components/partner/partner-work-list-v4.tsx", partnerPatch, "Partner Active Work");
patchFile("app/mindful/inventory/[id]/work/page.tsx", ownerPagePatch, "Owner Work page");
