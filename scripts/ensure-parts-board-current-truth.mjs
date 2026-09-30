import { readFileSync, writeFileSync } from "node:fs";

const path = "components/mindful-inventory/inventory-parts-board.tsx";
let source = readFileSync(path, "utf8");
const original = source;

if (!source.includes('const [editingPartId, setEditingPartId]')) {
  source = source.replace(
    '  const [openId, setOpenId] = useState<string | null>(() => requirements.find((item) => item.requirementStatus !== "not_required" && !item.fulfillmentMethod)?.id || requirements[0]?.id || null);',
    '  const [openId, setOpenId] = useState<string | null>(() => requirements.find((item) => item.requirementStatus !== "not_required" && !item.fulfillmentMethod)?.id || requirements[0]?.id || null);\n  const [editingPartId, setEditingPartId] = useState<string | null>(null);',
  );
}

source = source.replace(
`  const counts = useMemo(() => {
    const active = requirements.filter((item) => item.requirementStatus !== "not_required");
    return {
      total: active.length,
      decisions: active.filter((item) => !item.fulfillmentMethod).length,
      ordered: active.filter((item) => item.executionStatus === "ordered" || item.executionStatus === "backordered").length,
      ready: active.filter((item) => ["received", "installed"].includes(item.executionStatus || "") || item.fulfillmentMethod === "in_stock").length,
    };
  }, [requirements]);`,
`  const counts = useMemo(() => {
    const active = requirements.filter((item) => item.requirementStatus !== "not_required");
    return {
      decisions: active.filter((item) => !item.fulfillmentMethod).length,
      toOrder: active.filter((item) => item.fulfillmentMethod === "mindful_purchase" && !["ordered", "backordered", "received", "installed"].includes(item.executionStatus || "")).length,
      ordered: active.filter((item) => item.executionStatus === "ordered" || item.executionStatus === "backordered").length,
      ready: active.filter((item) => ["received", "installed"].includes(item.executionStatus || "") || item.fulfillmentMethod === "in_stock").length,
    };
  }, [requirements]);`,
);

source = source.replace(
`          <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">Mechanic suggestions stay suggestions until you decide. Compare the partner's offer, source it yourself, use stock, or mark it unnecessary. Ordering and receiving happen after that decision.</p>`,
`          <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">Each card shows one current truth. Open a part to review the plan; use Edit plan only when you need to change sourcing, status, or supporting details.</p>`,
);

source = source.replace(
`          <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[10px] font-black uppercase text-slate-400">Needed</div><div className="mt-1 font-black">{counts.total}</div></div>
          <div className="rounded-xl bg-amber-50 px-3 py-2"><div className="text-[10px] font-black uppercase text-amber-700">Decide</div><div className="mt-1 font-black text-amber-900">{counts.decisions}</div></div>
          <div className="rounded-xl bg-blue-50 px-3 py-2"><div className="text-[10px] font-black uppercase text-blue-700">Ordered</div><div className="mt-1 font-black text-blue-900">{counts.ordered}</div></div>
          <div className="rounded-xl bg-emerald-50 px-3 py-2"><div className="text-[10px] font-black uppercase text-emerald-700">Ready</div><div className="mt-1 font-black text-emerald-900">{counts.ready}</div></div>`,
`          <div className="rounded-xl bg-amber-50 px-3 py-2"><div className="text-[10px] font-black uppercase text-amber-700">Need decision</div><div className="mt-1 font-black text-amber-900">{counts.decisions}</div></div>
          <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[10px] font-black uppercase text-slate-500">To order</div><div className="mt-1 font-black text-slate-900">{counts.toOrder}</div></div>
          <div className="rounded-xl bg-blue-50 px-3 py-2"><div className="text-[10px] font-black uppercase text-blue-700">Ordered</div><div className="mt-1 font-black text-blue-900">{counts.ordered}</div></div>
          <div className="rounded-xl bg-emerald-50 px-3 py-2"><div className="text-[10px] font-black uppercase text-emerald-700">Ready</div><div className="mt-1 font-black text-emerald-900">{counts.ready}</div></div>`,
);

const startMarker = '      {requirements.length ? requirements.map((item) => {';
const endMarker = '\n\n      {displaySuggestions.length ?';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);

if (start !== -1 && end !== -1 && !source.slice(start, end).includes('Current plan')) {
  const block = `      {requirements.length ? requirements.map((item) => {
        const open = openId === item.id;
        const editing = editingPartId === item.id || !item.fulfillmentMethod;
        const target = targets[item.id] || { low: "", high: "" };
        const partnerPrice = item.partnerOfferUnitPrice;
        const sourceLabel = item.fulfillmentMethod === "mindful_purchase" ? "Mindful sourced" : item.fulfillmentMethod === "partner_supplied" ? "Partner supplied" : item.fulfillmentMethod === "in_stock" ? "In stock" : item.fulfillmentMethod === "customer_supplied" ? "Customer supplied" : item.fulfillmentMethod === "not_required" ? "Not required" : "Decision needed";
        const lifecycleLabel = item.requirementStatus === "not_required" || item.fulfillmentMethod === "not_required" ? "Not required" : item.executionStatus === "installed" ? "Installed" : item.executionStatus === "received" ? "Received" : item.executionStatus === "backordered" ? "Backordered" : item.executionStatus === "ordered" ? "Ordered" : item.fulfillmentMethod === "in_stock" ? "Ready" : item.fulfillmentMethod ? "Source confirmed" : "Decision needed";
        const planText = item.requirementStatus === "not_required" || item.fulfillmentMethod === "not_required" ? "This part is not required for the Work Order." : item.fulfillmentMethod === "mindful_purchase" ? \`Mindful is supplying this part. \${lifecycleLabel === "Received" || lifecycleLabel === "Installed" ? "It is ready for the work." : lifecycleLabel === "Ordered" || lifecycleLabel === "Backordered" ? \`Current status: \${lifecycleLabel.toLowerCase()}\${item.etaAt ? \` · ETA \${dateLabel(item.etaAt)}\` : ""}.\` : "Sourcing is assigned to Mindful."}\` : item.fulfillmentMethod === "partner_supplied" ? \`The Partner is supplying this part. Current status: \${lifecycleLabel.toLowerCase()}.\` : item.fulfillmentMethod === "in_stock" ? "This part is already in stock and ready for the work." : item.fulfillmentMethod === "customer_supplied" ? \`The customer/other source is supplying this part. Current status: \${lifecycleLabel.toLowerCase()}.\` : "A sourcing decision is still needed.";
        return <article key={item.id} className={\`overflow-hidden rounded-2xl border \${item.requirementStatus === "not_required" ? "border-slate-200 bg-slate-50/60" : !item.fulfillmentMethod ? "border-amber-200" : "border-slate-200"}\`}>
          <button type="button" onClick={() => { setOpenId(open ? null : item.id); if (open) setEditingPartId(null); }} className="flex w-full cursor-pointer items-start justify-between gap-4 px-4 py-4 text-left">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-black text-slate-950">{item.description}</h3>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase text-slate-600">Qty {item.quantity}</span>
                <span className={\`rounded-full px-2 py-1 text-[9px] font-black uppercase \${fulfillmentTone(item.fulfillmentMethod, item.executionStatus)}\`}>{sourceLabel}</span>
                {item.fulfillmentMethod && item.requirementStatus !== "not_required" ? <span className={\`rounded-full px-2 py-1 text-[9px] font-black uppercase \${lifecycleLabel === "Received" || lifecycleLabel === "Installed" || lifecycleLabel === "Ready" ? "bg-emerald-100 text-emerald-800" : lifecycleLabel === "Ordered" || lifecycleLabel === "Backordered" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}\`}>{lifecycleLabel}</span> : null}
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-500">For: {item.workTitle}{item.partNumber ? \` · Part # \${item.partNumber}\` : ""}</div>
            </div>
            <div className="shrink-0 text-right">
              {item.etaAt && ["ordered", "backordered"].includes(item.executionStatus || "") ? <div className="text-[10px] font-black uppercase text-slate-500">ETA {dateLabel(item.etaAt)}</div> : null}
              <div className="mt-2 text-[10px] font-black text-blue-700">{open ? "Collapse" : "Review →"}</div>
            </div>
          </button>

          {open ? <div className="border-t border-slate-100 p-4">
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Current plan</div>
                <div className="mt-1 text-sm font-black text-slate-950">{sourceLabel} · {lifecycleLabel}</div>
                <div className="mt-1 text-xs font-semibold leading-5 text-slate-600">{planText}</div>
              </div>
              {item.fulfillmentMethod ? <button type="button" onClick={() => setEditingPartId(editing ? null : item.id)} className="shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-800">{editing ? "Done editing" : "Edit plan"}</button> : null}
            </div>

            {(item.partnerOfferNote || partnerPrice != null) ? <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Partner note</div>
              <div className="mt-1 text-xs font-semibold text-slate-700">{item.suggestedByPartnerName || "Mechanic"}{partnerPrice != null ? \` offered to supply it for about \${money(partnerPrice)}.\` : " provided sourcing input."}</div>
              {item.partnerOfferNote ? <div className="mt-1 text-xs font-medium text-slate-600">{item.partnerOfferNote}</div> : null}
            </div> : null}

            {item.origin === "ai" ? <div className="mt-2 text-[10px] font-semibold text-slate-400">Lot Logic suggestion: this item originated as an AI suggestion. The current plan above is the Owner-approved operational state.</div> : null}

            {editing ? <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/20 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">1 · Is this part required?</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button disabled={working === item.id} onClick={() => void decide(item, item.fulfillmentMethod && item.fulfillmentMethod !== "not_required" ? item.fulfillmentMethod : "mindful_purchase")} className={\`cursor-pointer rounded-xl border px-3 py-2 text-xs font-black \${item.requirementStatus !== "not_required" && item.fulfillmentMethod !== "not_required" ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-200 bg-white text-slate-700"}\`}>Required</button>
                <button disabled={working === item.id} onClick={() => void decide(item, "not_required")} className={\`cursor-pointer rounded-xl border px-3 py-2 text-xs font-black \${item.fulfillmentMethod === "not_required" ? "border-slate-700 bg-slate-700 text-white" : "border-slate-200 bg-white text-slate-600"}\`}>Not required</button>
              </div>

              {item.requirementStatus !== "not_required" && item.fulfillmentMethod !== "not_required" ? <div className="mt-4">
                <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">2 · Who is supplying it?</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button disabled={working === item.id} onClick={() => void decide(item, "mindful_purchase")} className={\`cursor-pointer rounded-xl border px-3 py-2 text-xs font-black \${item.fulfillmentMethod === "mindful_purchase" ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200 bg-white text-slate-700"}\`}>Mindful sources</button>
                  <button disabled={working === item.id} onClick={() => void decide(item, "in_stock")} className={\`cursor-pointer rounded-xl border px-3 py-2 text-xs font-black \${item.fulfillmentMethod === "in_stock" ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-200 bg-white text-slate-700"}\`}>In stock</button>
                  <button disabled={working === item.id} onClick={() => void decide(item, "partner_supplied")} className={\`cursor-pointer rounded-xl border px-3 py-2 text-xs font-black \${item.fulfillmentMethod === "partner_supplied" ? "border-violet-700 bg-violet-700 text-white" : "border-slate-200 bg-white text-slate-700"}\`}>Partner supplies{partnerPrice != null ? \` · \${money(partnerPrice)}\` : ""}</button>
                  <button disabled={working === item.id} onClick={() => void decide(item, "customer_supplied")} className={\`cursor-pointer rounded-xl border px-3 py-2 text-xs font-black \${item.fulfillmentMethod === "customer_supplied" ? "border-slate-700 bg-slate-700 text-white" : "border-slate-200 bg-white text-slate-700"}\`}>Customer supplies</button>
                </div>
              </div> : null}

              {item.fulfillmentMethod === "mindful_purchase" ? <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Sourcing details</div><div className="mt-1 text-sm font-semibold text-slate-700">{item.fitmentQuery || item.description}</div></div>
                  <div className="flex flex-wrap gap-2">{item.sources.map((source) => source.key === "turn14" ? <button key={source.key} type="button" onClick={() => { copyQuery(item.fitmentQuery || item.description); window.open(source.url, "_blank", "noopener,noreferrer"); }} className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">Turn 14 ↗</button> : <a key={source.key} href={source.url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black">{source.label} ↗</a>)}</div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[140px_140px_1fr_auto]">
                  <input inputMode="decimal" value={target.low} onChange={(e) => setTargets((current) => ({ ...current, [item.id]: { ...target, low: e.target.value } }))} placeholder="Target low $" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" />
                  <input inputMode="decimal" value={target.high} onChange={(e) => setTargets((current) => ({ ...current, [item.id]: { ...target, high: e.target.value } }))} placeholder="Target high $" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" />
                  <input value={notes[item.id] || ""} onChange={(e) => setNotes((current) => ({ ...current, [item.id]: e.target.value }))} placeholder="Optional sourcing note" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" />
                  <button type="button" disabled={working === item.id} onClick={() => void decide(item, "mindful_purchase")} className="cursor-pointer rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Save plan</button>
                </div>
              </div> : null}
            </div> : null}

            {item.messages.length ? <details className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
              <summary className="cursor-pointer text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Conversation & history · {item.messages.length}</summary>
              <div className="mt-3 space-y-2">{item.messages.map((entry) => <div key={entry.id} className={\`rounded-xl px-3 py-2 text-sm \${entry.actorType === "owner" ? "ml-8 bg-slate-950 text-white" : entry.actorType === "partner" ? "mr-8 bg-blue-50 text-blue-950" : "bg-slate-100 text-slate-700"}\`}><div className="text-[9px] font-black uppercase opacity-60">{entry.actorLabel}{entry.unitPrice != null ? \` · \${money(entry.unitPrice)}\` : ""}</div><div className="mt-0.5 font-medium">{entry.body}</div>{entry.sourceUrl ? <a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-black underline">Open source ↗</a> : null}</div>)}</div>
            </details> : null}

            {editing ? <div className="mt-3 flex gap-2">
              <input value={notes[item.id] || ""} onChange={(e) => setNotes((current) => ({ ...current, [item.id]: e.target.value }))} placeholder="Add a note or counter suggestion…" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs" />
              <button type="button" disabled={working === item.id || !(notes[item.id] || "").trim()} onClick={() => void addMessage(item, target.low || target.high ? "counter" : "note")} className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-xs font-black disabled:opacity-40">Send</button>
            </div> : null}
          </div> : null}
        </article>;
      }) : <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-8 text-center"><div className="font-black text-slate-800">No confirmed part requirements yet.</div><div className="mt-1 text-sm text-slate-500">Mechanic suggestions and Lot Logic suggestions will appear here as the Work Plan develops.</div></div>}`;
  source = source.slice(0, start) + block + source.slice(end);
}

if (source !== original) {
  writeFileSync(path, source, "utf8");
  console.log("Simplified Parts Board around current operational truth.");
} else {
  console.log("Parts Board current-truth workflow already aligned.");
}
