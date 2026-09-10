import { readFileSync, writeFileSync } from "node:fs";

const path = "components/mindful-inventory/inventory-active-work-v6.tsx";
let source = readFileSync(path, "utf8");
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

// Owner may start internal Mindful work. External partner work must be started by the partner.
source = source.replaceAll(
  'const canStart = !done && work.status !== "in_progress" && !issue;',
  'const canStart = !done && work.status !== "in_progress" && !issue && !work.assignedPartnerId;',
);
source = source.replaceAll(
  '>Complete setup first</div> : null}',
  '>{work.assignedPartnerId && !issue ? "Partner starts work" : "Complete setup first"}</div> : null}',
);

if (source !== original) {
  writeFileSync(path, source, "utf8");
  console.log("Aligned Active Work assignee labels, confirmed schedule state, and start-work authority.");
} else {
  console.log("Active Work assignment authority already aligned.");
}
