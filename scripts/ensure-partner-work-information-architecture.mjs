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
  if (source.includes('data-partner-work-ia="vehicle-service-v1"')) return;

  if (!source.includes('PartnerPartsConversationBoard')) {
    source = source.replace(
      'import { PartnerWorkListV4 } from "@/components/partner/partner-work-list-v4";',
      'import { PartnerWorkListV4 } from "@/components/partner/partner-work-list-v4";\nimport { PartnerPartsConversationBoard } from "@/components/partner/partner-parts-conversation-board";',
    );
  }

  source = source.replace('type ViewMode = "vehicle" | "calendar";', 'type ViewMode = "vehicle" | "service" | "calendar";');

  const groupsAnchor = '  }, [openItems]);\n\n  const [view, setView] = useState<ViewMode>("vehicle");';
  if (source.includes(groupsAnchor)) {
    source = source.replace(groupsAnchor, `  }, [openItems]);\n\n  const serviceGroups = useMemo(() => {\n    const map = new Map<string, PartnerWorkItem[]>();\n    for (const work of openItems) {\n      const key = work.category || "Other";\n      map.set(key, [...(map.get(key) || []), work]);\n    }\n    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));\n  }, [openItems]);\n\n  const [view, setView] = useState<ViewMode>("vehicle");`);
  }

  source = source.replace(
    '<PartnerWorkListV4 workItems={[work]} permissions={permissions} /><div className="mt-3 flex justify-end">',
    '<PartnerWorkListV4 workItems={[work]} permissions={permissions} /><PartnerPartsConversationBoard workOrderIds={[work.id]} /><div className="mt-3 flex justify-end">',
  );
  source = source.replace('{hasNextWork ? "Next Work Order →" : "Collapse"}', '{hasNextWork ? "Next Work Order →" : "Proceed →"}');

  const controlsOld = '<div className="inline-flex self-start rounded-xl border border-slate-200 bg-white p-1 shadow-sm"><button onClick={() => setView("vehicle")} className={`rounded-lg px-4 py-2 text-xs font-black ${view === "vehicle" ? "bg-slate-950 text-white" : "text-slate-600"}`}>By Vehicle</button><button onClick={() => setView("calendar")} className={`rounded-lg px-4 py-2 text-xs font-black ${view === "calendar" ? "bg-slate-950 text-white" : "text-slate-600"}`}>Calendar</button></div>';
  const controlsNew = '<div data-partner-work-ia="vehicle-service-v1" className="inline-flex self-start rounded-xl border border-slate-200 bg-white p-1 shadow-sm"><button onClick={() => setView("vehicle")} className={`rounded-lg px-4 py-2 text-xs font-black ${view === "vehicle" ? "bg-slate-950 text-white" : "text-slate-600"}`}>By Vehicle</button><button onClick={() => setView("service")} className={`rounded-lg px-4 py-2 text-xs font-black ${view === "service" ? "bg-slate-950 text-white" : "text-slate-600"}`}>By Service</button><button onClick={() => setView("calendar")} className={`rounded-lg px-4 py-2 text-xs font-black ${view === "calendar" ? "bg-slate-950 text-white" : "text-slate-600"}`}>Calendar</button></div>';
  source = source.replace(controlsOld, controlsNew);

  const vehicleCalendarStart = '    {view === "vehicle" ? <div className="space-y-3">';
  const calendarMarker = '</div> : <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 bg-slate-50 px-5 py-4"><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Week</div>';
  const start = source.indexOf(vehicleCalendarStart);
  const marker = source.indexOf(calendarMarker, start);
  if (start !== -1 && marker !== -1) {
    const vehicleChunk = source.slice(start, marker + '</div>'.length);
    const serviceChunk = ` : view === "service" ? <div className="space-y-3">{serviceGroups.map(([service, items]) => <section key={service} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 bg-slate-50 px-5 py-3"><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Service</div><div className="mt-1 flex items-center gap-2"><h2 className="text-lg font-black">{service.replaceAll("_", " ").replace(/\\b\\w/g, (letter) => letter.toUpperCase())}</h2><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-500">{items.length} job{items.length === 1 ? "" : "s"}</span></div></div><div className="space-y-2 p-4">{items.map((work) => jobRow(work, true))}</div></section>)}</div>`;
    source = source.slice(0, marker) + serviceChunk + source.slice(marker);
  }

  writeFileSync(path, source, "utf8");
}

patchPage();
patchPartsBoard();
patchGrouped();
console.log("Partner Work now groups by vehicle/service and embeds parts with each Work Order.");
