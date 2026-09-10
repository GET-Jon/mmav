import { readFileSync, writeFileSync } from "node:fs";

function patch(path, transform) {
  const source = readFileSync(path, "utf8");
  const updated = transform(source);
  if (updated !== source) {
    writeFileSync(path, updated, "utf8");
    return true;
  }
  return false;
}

function addImport(source, anchor) {
  if (source.includes('from "@/components/scheduling/suggested-time-picker"')) return source;
  if (source.includes(anchor)) return source.replace(anchor, `${anchor}\nimport { SuggestedTimePicker } from "@/components/scheduling/suggested-time-picker";`);
  return source;
}

let changed = false;

changed = patch("components/mindful-inventory/inventory-active-work-v6.tsx", (source) => {
  let updated = addImport(source, 'import { WorkOrderPartsModal } from "@/components/mindful-inventory/work-order-parts-modal";');

  updated = updated.replaceAll(
    '{!done && !editing ? <div className="mt-2 text-[10px] font-semibold text-slate-400">Every setup tile is independent. Select Parts, Partner, Quote, Location, or Schedule at any time to review or change it.</div> : null}',
    '',
  );
  updated = updated.replaceAll(
    '{!done && !editing ? <div className="mt-2 text-[10px] font-semibold text-slate-400">Select Parts, Partner, Quote, Location, or Schedule above to review or change it.</div> : null}',
    '',
  );
  updated = updated.replaceAll(
    '<div className="mt-2 text-[10px] font-semibold text-slate-400">Every setup tile is independent. Select Parts, Partner, Quote, Location, or Schedule at any time to review or change it.</div>',
    '',
  );
  updated = updated.replaceAll(
    '<div className="mt-2 text-[10px] font-semibold text-slate-400">Select Parts, Partner, Quote, Location, or Schedule above to review or change it.</div>',
    '',
  );

  if (!updated.includes("manualScheduleId, setManualScheduleId")) {
    updated = updated.replace(
      '  const [editingSetupId, setEditingSetupId] = useState<string | null>(null);',
      '  const [editingSetupId, setEditingSetupId] = useState<string | null>(null);\n  const [manualScheduleId, setManualScheduleId] = useState<string | null>(null);',
    );
  }

  const manualAnchor = '<div className="flex flex-col gap-2 sm:flex-row"><input disabled={workingId === work.id} type="datetime-local" value={draftValue}';
  if (updated.includes(manualAnchor) && !updated.includes('endpoint={`/api/mindful/inventory/work-orders/${work.id}/availability`}')) {
    updated = updated.replace(
      manualAnchor,
      '<SuggestedTimePicker endpoint={`/api/mindful/inventory/work-orders/${work.id}/availability`} calendarHref="/mindful/inventory/schedule?embed=1" selectedStartAt={draftValue || work.proposedStartAt || work.scheduledStartAt} onSelect={(startAt) => setScheduleDrafts((current) => ({ ...current, [work.id]: localInput(startAt) }))} onManualRequest={() => setManualScheduleId((current) => current === work.id ? null : work.id)} manualExpanded={manualScheduleId === work.id} />\n                        <div className={`${manualScheduleId === work.id ? "flex" : "hidden"} flex-col gap-2 sm:flex-row`}><input disabled={workingId === work.id} type="datetime-local" value={draftValue}',
    );
  }
  updated = updated.replace(
    'body: JSON.stringify({ scheduledStartAt: new Date(value).toISOString() }),',
    'body: JSON.stringify({ scheduledStartAt: new Date(value).toISOString(), tzOffset: new Date().getTimezoneOffset() }),',
  );
  return updated;
}) || changed;

changed = patch("components/mindful-inventory/inventory-schedule-board.tsx", (source) => {
  let updated = addImport(source, 'import Link from "next/link";');
  const editorAnchor = '<div className="rounded-xl border border-slate-200 p-4"><label className="block"><div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Scheduled start</div><input type="datetime-local" value={starts[selectedItem.id] || localInput(selectedItem.scheduledStartAt)}';
  if (updated.includes(editorAnchor) && !updated.includes('endpoint={`/api/mindful/inventory/work-orders/${selectedItem.id}/availability`}')) {
    updated = updated.replace(
      editorAnchor,
      '<div className="rounded-xl border border-slate-200 p-4"><SuggestedTimePicker endpoint={`/api/mindful/inventory/work-orders/${selectedItem.id}/availability`} selectedStartAt={starts[selectedItem.id] || selectedItem.scheduledStartAt} onSelect={(startAt) => setStarts((current) => ({ ...current, [selectedItem.id]: localInput(startAt) }))} /><label className="block"><div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Other time</div><input type="datetime-local" value={starts[selectedItem.id] || localInput(selectedItem.scheduledStartAt)}',
    );
  }
  return updated;
}) || changed;

changed = patch("components/mindful-inventory/inventory-detailing.tsx", (source) => {
  let updated = addImport(source, 'import { useRouter } from "next/navigation";');
  const gridAnchor = '<div className="mt-6 grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2 lg:grid-cols-4">';
  if (updated.includes(gridAnchor) && !updated.includes('vehicles/${detailing.vehicleId}/detailing/availability')) {
    updated = updated.replace(
      gridAnchor,
      '<div className="mt-6 border-t border-slate-200 pt-5"><SuggestedTimePicker endpoint={`/api/mindful/inventory/vehicles/${detailing.vehicleId}/detailing/availability?partnerId=${encodeURIComponent(partnerId)}&durationMinutes=${turnaroundHours ? Math.round(Number(turnaroundHours) * 60) : 120}`} selectedStartAt={scheduledStart || null} onSelect={(startAt) => setScheduledStart(localInput(startAt))} /></div>\n      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">',
    );
  }
  updated = updated.replace('Scheduled start<input type="datetime-local"', 'Other time<input type="datetime-local"');
  return updated;
}) || changed;

changed = patch("components/partner/partner-detailing-list.tsx", (source) => {
  let updated = addImport(source, 'import { useRouter } from "next/navigation";');
  const gridAnchor = '<div className="mt-4 grid gap-2 sm:grid-cols-3"><label className="text-[10px] font-black text-slate-500">Schedule<input type="datetime-local"';
  if (updated.includes(gridAnchor) && !updated.includes('partner/detailing/${item.id}/availability')) {
    updated = updated.replace(
      gridAnchor,
      '<div className="mt-4"><SuggestedTimePicker compact endpoint={`/api/partner/detailing/${item.id}/availability?durationMinutes=${draft.turnaround ? Math.round(Number(draft.turnaround) * 60) : 120}`} selectedStartAt={draft.time || item.scheduledStartAt} onSelect={(startAt) => setDraft(item, { time: localInput(startAt) })} /></div>\n          <div className="mt-3 grid gap-2 sm:grid-cols-3"><label className="text-[10px] font-black text-slate-500">Other time<input type="datetime-local"',
    );
  }
  return updated;
}) || changed;

changed = patch("components/partner/partner-work-list-v4.tsx", (source) => {
  let updated = source.replace(
    'fetch(`/api/partner/work-orders/${work.id}/availability`)',
    'fetch(`/api/partner/work-orders/${work.id}/availability?tzOffset=${new Date().getTimezoneOffset()}`)',
  );
  updated = updated.replace(
    'const payload = await response.json() as { error?: string; suggestions?: ScheduleSuggestion[] };',
    'const payload = await response.json() as { error?: string; guidance?: string | null; suggestions?: ScheduleSuggestion[] };',
  );
  updated = updated.replace(
    'setAvailabilityText((current) => ({ ...current, [work.id]: items.length ? "Suggested available times" : "No open standard-hours slots found in the next 10 days." }));',
    'setAvailabilityText((current) => ({ ...current, [work.id]: payload.guidance ? `Suggested available times · ${payload.guidance}` : items.length ? "Suggested available times" : "No open standard-hours slots found in the next two weeks." }));',
  );
  return updated;
}) || changed;

console.log(changed ? "Added schedule suggestions everywhere operational times are selected." : "Suggested-time controls already aligned.");
