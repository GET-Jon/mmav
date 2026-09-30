import { readFileSync, writeFileSync } from "node:fs";

function patchPage() {
  const path = "app/partner/work/page.tsx";
  let source = readFileSync(path, "utf8");
  source = source.replace('import { PartnerPartsConversationBoard } from "@/components/partner/partner-parts-conversation-board";\n', '');
  source = source.replace(/\n  const partConversationWorkIds = workItems\.filter\([^\n]+\)\.map\([^\n]+\);/, '');
  source = source.replace('\n      <PartnerPartsConversationBoard workOrderIds={partConversationWorkIds} />', '');
  writeFileSync(path, source, "utf8");
}

function patchPartsBoard() {
  const path = "components/partner/partner-parts-conversation-board.tsx";
  let source = readFileSync(path, "utf8");

  if (!source.includes('const allowedWorkOrderIds = new Set(workOrderIds);')) {
    source = source.replace(
      '      setItems(data.items || []);\n      setWorkOrders(data.workOrders || []);',
      '      const allowedWorkOrderIds = new Set(workOrderIds);\n      setItems((data.items || []).filter((item) => allowedWorkOrderIds.has(item.work_order_id)));\n      setWorkOrders((data.workOrders || []).filter((work) => allowedWorkOrderIds.has(work.id)));',
    );
  }

  source = source.replace(
    '<section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">',
    '<section data-embedded-parts-board="true" className="mt-3 rounded-xl border border-slate-200 bg-white">',
  );
  source = source.replace(
    '<div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">',
    '<div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">',
  );
  source = source.replace(
    '<div><div className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-600">Parts conversation</div><h2 className="mt-1 text-xl font-black">Parts & sourcing</h2><p className="mt-1 max-w-3xl text-sm text-slate-600">Tell the Owner what the job needs, what you can supply it for, or whether they may want to source it themselves. Lot Logic can tee up likely parts so you can agree and move on.</p></div>',
    '<div><div className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-600">Parts & sourcing</div><p className="mt-1 text-xs text-slate-500">Suggestions and Owner decisions for this Work Order.</p></div>',
  );
  source = source.replace('className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">+ Suggest a Part</button>', 'className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">+ Suggest a part</button>');
  source = source.replace('<div className="p-5">', '<div className="p-4">');
  writeFileSync(path, source, "utf8");
}

function patchGrouped() {
  const path = "components/partner/partner-work-grouped-v2.tsx";
  let source = readFileSync(path, "utf8");
  if (source.includes('data-partner-work-ia="vehicle-service-v2"')) return;

  if (!source.includes('PartnerPartsConversationBoard')) {
    source = source.replace(
      'import { PartnerWorkListV4 } from "@/components/partner/partner-work-list-v4";',
      'import { PartnerWorkListV4 } from "@/components/partner/partner-work-list-v4";\nimport { PartnerPartsConversationBoard } from "@/components/partner/partner-parts-conversation-board";',
    );
  }

  source = source.replace('type ViewMode = "vehicle" | "calendar";', 'type ViewMode = "vehicle" | "service" | "calendar";');

  const groupsAnchor = '  }, [openItems]);\n\n  const [view, setView] = useState<ViewMode>("vehicle");';
  if (source.includes(groupsAnchor) && !source.includes('const serviceGroups = useMemo')) {
    source = source.replace(groupsAnchor, `  }, [openItems]);\n\n  const serviceGroups = useMemo(() => {\n    const map = new Map<string, PartnerWorkItem[]>();\n    for (const work of openItems) {\n      const key = work.category || "Other";\n      map.set(key, [...(map.get(key) || []), work]);\n    }\n    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));\n  }, [openItems]);\n\n  const [view, setView] = useState<ViewMode>("vehicle");`);
  }

  source = source.replace(
    '<PartnerWorkListV4 workItems={[work]} permissions={permissions} /><div className="mt-3 flex justify-end">',
    '<PartnerWorkListV4 workItems={[work]} permissions={permissions} /><PartnerPartsConversationBoard workOrderIds={[work.id]} /><div className="mt-3 flex justify-end">',
  );
  source = source.replace('{hasNextWork ? "Next Work Order →" : "Collapse"}', '{hasNextWork ? "Next Work Order →" : "Proceed →"}');

  const returnStart = source.indexOf('  return <div className="space-y-4">');
  const completedMarker = source.indexOf('    {completedItems.length ?', returnStart);
  if (returnStart === -1 || completedMarker === -1) {
    console.log("Partner Work IA skipped: view shell anchors not found.");
    return;
  }

  const viewShell = [
    '  return <div className="space-y-4">',
    '    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">',
    '      <div data-partner-work-ia="vehicle-service-v2" className="inline-flex self-start rounded-xl border border-slate-200 bg-white p-1 shadow-sm">',
    '        <button onClick={() => setView("vehicle")} className={`rounded-lg px-4 py-2 text-xs font-black ${view === "vehicle" ? "bg-slate-950 text-white" : "text-slate-600"}`}>By Vehicle</button>',
    '        <button onClick={() => setView("service")} className={`rounded-lg px-4 py-2 text-xs font-black ${view === "service" ? "bg-slate-950 text-white" : "text-slate-600"}`}>By Service</button>',
    '        <button onClick={() => setView("calendar")} className={`rounded-lg px-4 py-2 text-xs font-black ${view === "calendar" ? "bg-slate-950 text-white" : "text-slate-600"}`}>Calendar</button>',
    '      </div>',
    '      {view === "calendar" ? <div className="flex gap-2"><button onClick={() => setWeekOffset((v) => v - 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black">← Previous</button><button onClick={() => setWeekOffset(0)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black">Today</button><button onClick={() => setWeekOffset((v) => v + 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black">Next →</button></div> : null}',
    '    </div>',
    '',
    '    {view === "vehicle" ? <div className="space-y-3">{groups.map((group) => {',
    '      const expanded = openVehicle === group.vehicleId;',
    '      const inProgress = group.items.filter((w) => w.status === "in_progress").length;',
    '      const attention = group.items.filter((w) => state(w).label !== "Ready" && w.status !== "in_progress").length;',
    '      return <section key={group.vehicleId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><button onClick={() => setOpenVehicle(expanded ? null : group.vehicleId)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black">{group.vehicleLabel}</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{group.items.length} job{group.items.length === 1 ? "" : "s"}</span>{inProgress ? <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-black text-blue-700">{inProgress} in progress</span> : null}{attention ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-800">{attention} need attention</span> : null}</div><div className="mt-1 text-xs font-semibold text-slate-500">Next: {group.items[0]?.title} · {shortDate(group.items[0]?.scheduledStartAt || group.items[0]?.proposedStartAt || null)}{group.vin ? ` · VIN …${group.vin.slice(-8)}` : ""}</div></div><div className="text-xs font-black text-slate-400">{expanded ? "Collapse ↑" : "Expand ↓"}</div></button>{expanded ? <div className="space-y-2 border-t border-slate-200 bg-slate-50/40 p-4">{group.items.map((work) => jobRow(work))}</div> : null}</section>; ',
    '    })}</div> : null}',
    '',
    '    {view === "service" ? <div className="space-y-3">{serviceGroups.map(([service, items]) => <section key={service} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 bg-slate-50 px-5 py-3"><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Service</div><div className="mt-1 flex items-center gap-2"><h2 className="text-lg font-black">{service.replaceAll("_", " ").replace(/\\b\\w/g, (letter) => letter.toUpperCase())}</h2><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-500">{items.length} job{items.length === 1 ? "" : "s"}</span></div></div><div className="space-y-2 p-4">{items.map((work) => jobRow(work, true))}</div></section>)}</div> : null}',
    '',
    '    {view === "calendar" ? <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 bg-slate-50 px-5 py-4"><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Week</div><div className="mt-1 text-lg font-black">{weekStart.toLocaleDateString("en-US", { month: "long", day: "numeric" })} – {addDays(weekStart, 6).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div></div><div className="divide-y divide-slate-200">{days.map((day) => { const items = openItems.filter((w) => { const value = w.scheduledStartAt || w.proposedStartAt; return value && sameDay(new Date(value), day); }); return <div key={day.toISOString()} className={sameDay(day, new Date()) ? "bg-blue-50/30" : ""}><div className="flex items-center justify-between px-5 py-3"><div className="text-sm font-black">{day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div><div className="text-xs font-bold text-slate-400">{items.length ? `${items.length} job${items.length === 1 ? "" : "s"}` : "Open"}</div></div>{items.length ? <div className="space-y-2 px-5 pb-4">{items.map((work) => jobRow(work, true))}</div> : null}</div>; })}</div></section> : null}',
    '',
  ].join("\n");

  source = source.slice(0, returnStart) + viewShell + source.slice(completedMarker);
  writeFileSync(path, source, "utf8");
}

patchPage();
patchPartsBoard();
patchGrouped();
console.log("Partner Work now groups cleanly by vehicle/service and embeds parts with each Work Order.");
