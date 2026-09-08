import { readFileSync, writeFileSync } from "node:fs";

const path = "components/mindful-inventory/inventory-active-work-v6.tsx";
let source = readFileSync(path, "utf8");
const original = source;

// Remove the standalone reassignment UI. Reassignment remains supported through the Partner tile.
source = source.replace(/\n  const \[reassigningId, setReassigningId\] = useState<string \| null>\(null\);/, "");
source = source.replace(/\n  const \[reassignDrafts, setReassignDrafts\] = useState<Record<string, string>>\(\{\}\);/, "");
source = source.replace(/\n\s*\{work\.assignedPartnerId && !\["in_progress", "complete", "cancelled"\]\.includes\(work\.status\) \? <button type="button" onClick=\{\(\) => \{ setReassigningId[\s\S]*?>Reassign Work<\/button> : null\}/, "");
source = source.replace(/\n\s*\{reassigningId === work\.id \? <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50\/60 p-3">[\s\S]*?<\/div> : null\}(?=\n\s*\{rowMessage \?)/, "");

const oldStep = `function Step({ n, label, done, active, detail }: { n: number; label: string; done: boolean; active: boolean; detail?: string }) {
  return (
    <div className={\`rounded-lg border px-2.5 py-2 \${active ? "border-blue-300 bg-blue-50" : done ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white"}\`}>
      <div className="flex items-center gap-2">
        <span className={\`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black \${done ? "bg-emerald-600 text-white" : active ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-400"}\`}>{done ? "✓" : n}</span>
        <span className={\`text-[10px] font-black uppercase \${active ? "text-blue-800" : done ? "text-emerald-800" : "text-slate-400"}\`}>{label}</span>
      </div>
      {detail ? <div className="mt-1 truncate text-[10px] font-semibold text-slate-500">{detail}</div> : null}
    </div>
  );
}`;

const newStep = `function Step({ n, label, done, active, detail, selected, onClick }: { n: number; label: string; done: boolean; active: boolean; detail?: string; selected?: boolean; onClick?: () => void }) {
  const content = <>
    <div className="flex items-center gap-2">
      <span className={\`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black \${done ? "bg-emerald-600 text-white" : active ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-400"}\`}>{done ? "✓" : n}</span>
      <span className={\`text-[10px] font-black uppercase \${active ? "text-blue-800" : done ? "text-emerald-800" : "text-slate-500"}\`}>{label}</span>
    </div>
    {detail ? <div className="mt-1 truncate text-[10px] font-semibold text-slate-500">{detail}</div> : null}
    {onClick ? <div className="mt-1 text-[9px] font-black text-blue-700 opacity-0 transition group-hover:opacity-100">Open / edit →</div> : null}
  </>;
  const cls = \`group w-full rounded-lg border px-2.5 py-2 text-left transition \${selected ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100" : active ? "border-blue-300 bg-blue-50" : done ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white"} \${onClick ? "cursor-pointer hover:border-blue-400 hover:shadow-sm" : ""}\`;
  return onClick ? <button type="button" onClick={onClick} className={cls}>{content}</button> : <div className={cls}>{content}</div>;
}`;
if (source.includes(oldStep)) source = source.replace(oldStep, newStep);

const stateAnchor = `  const [editingSetupId, setEditingSetupId] = useState<string | null>(null);`;
if (!source.includes("editingSetupStep")) {
  source = source.replace(stateAnchor, `${stateAnchor}\n  const [editingSetupStep, setEditingSetupStep] = useState<Record<string, number | null>>({});`);
}

source = source.replace(
  `            const editing = editingSetupId === work.id;`,
  `            const editing = editingSetupId === work.id;\n            const editingStep = editing ? (editingSetupStep[work.id] ?? null) : null;\n            const openStep = (step: number) => { setEditingSetupId(work.id); setEditingSetupStep((current) => ({ ...current, [work.id]: step })); };`,
);

const oldSteps = `<Step n={1} label="Parts" done={work.partsReviewComplete} active={partsActive} detail={work.partsReviewComplete ? (work.partsReadyForExecution ? (jobParts.length ? "Ready" : "None required") : \`${work.pendingPartCount} pending\`) : "Review"} />
                        <Step n={2} label="Partner" done={Boolean(work.performerName)} active={partnerActive} detail={work.performerName || undefined} />
                        <Step n={3} label="Quote" done={quoteComplete} active={quoteActive} detail={quoteDetail(work)} />
                        <Step n={4} label="Location" done={Boolean(work.locationId)} active={locationActive} detail={work.locationName || undefined} />
                        <Step n={5} label="Schedule" done={Boolean(work.scheduledStartAt)} active={scheduleActive} detail={work.scheduledStartAt ? dateTimeLabel(work.scheduledStartAt) : undefined} />`;
const newSteps = `<Step n={1} label="Parts" done={work.partsReviewComplete} active={partsActive} selected={editingStep === 1} onClick={!done ? () => openStep(1) : undefined} detail={work.partsReviewComplete ? (work.partsReadyForExecution ? (jobParts.length ? "Ready" : "None required") : \`${work.pendingPartCount} pending\`) : "Review"} />
                        <Step n={2} label="Partner" done={Boolean(work.performerName)} active={partnerActive} selected={editingStep === 2} onClick={!done ? () => openStep(2) : undefined} detail={work.performerName || "Unassigned"} />
                        <Step n={3} label="Quote" done={quoteComplete} active={quoteActive} selected={editingStep === 3} onClick={!done ? () => openStep(3) : undefined} detail={quoteDetail(work)} />
                        <Step n={4} label="Location" done={Boolean(work.locationId)} active={locationActive} selected={editingStep === 4} onClick={!done ? () => openStep(4) : undefined} detail={work.locationName || "Not selected"} />
                        <Step n={5} label="Schedule" done={Boolean(work.scheduledStartAt)} active={scheduleActive} selected={editingStep === 5} onClick={!done ? () => openStep(5) : undefined} detail={work.scheduledStartAt ? dateTimeLabel(work.scheduledStartAt) : "Unscheduled"} />`;
if (source.includes(oldSteps)) source = source.replace(oldSteps, newSteps);

source = source.replaceAll(`(partsActive || editing)`, `(partsActive || editingStep === 1)`);
source = source.replaceAll(`(partnerActive || editing)`, `(partnerActive || editingStep === 2)`);
source = source.replaceAll(`(quoteActive || editing)`, `(quoteActive || editingStep === 3)`);
source = source.replaceAll(`(locationActive || editing)`, `(locationActive || editingStep === 4)`);
source = source.replaceAll(`(scheduleActive || editing)`, `(scheduleActive || editingStep === 5)`);

source = source.replace(
  `<div className="flex items-center justify-between gap-2"><div className="text-[9px] font-black uppercase text-blue-700">{editing ? "Edit setup" : "Next setup step"}</div>{editing ? <button onClick={() => setEditingSetupId(null)} className="text-[10px] font-black text-slate-500">Done</button> : null}</div>`,
  `<div className="flex items-center justify-between gap-2"><div className="text-[9px] font-black uppercase text-blue-700">{editing ? "Edit setup" : "Next setup step"}</div>{editing ? <button onClick={() => { setEditingSetupId(null); setEditingSetupStep((current) => ({ ...current, [work.id]: null })); }} className="text-[10px] font-black text-slate-500 hover:text-slate-900">Close</button> : null}</div>`,
);

source = source.replace(
  `{!done && !issue && !editing ? <button onClick={() => setEditingSetupId(work.id)} className="mt-2 text-[10px] font-black text-slate-500 hover:text-slate-900">Edit setup</button> : null}`,
  `{!done && !editing ? <div className="mt-2 text-[10px] font-semibold text-slate-400">Select Parts, Partner, Quote, Location, or Schedule above to review or change it.</div> : null}`,
);

// Scheduling success should close the selected editor as well.
source = source.replace(`      setEditingSetupId(null);\n      router.refresh();`, `      setEditingSetupId(null);\n      setEditingSetupStep((current) => ({ ...current, [work.id]: null }));\n      router.refresh();`);

if (source !== original) {
  writeFileSync(path, source, "utf8");
  console.log("Made Active Work setup tiles clickable and removed the standalone reassignment control.");
} else {
  console.log("Active Work command-center editing already aligned.");
}
