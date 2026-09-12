import { readFileSync, writeFileSync } from "node:fs";

function patchGroupedWork() {
  const path = "components/partner/partner-work-grouped-v2.tsx";
  let source = readFileSync(path, "utf8");
  if (source.includes('data-partner-next-work="true"')) return;

  const stateAnchor = '  const [weekOffset, setWeekOffset] = useState(0);';
  if (!source.includes(stateAnchor)) return;
  source = source.replace(stateAnchor, stateAnchor + `\n\n  function advanceFrom(workId: string) {\n    const index = openItems.findIndex((item) => item.id === workId);\n    const next = index >= 0 ? openItems[index + 1] : null;\n    setOpenWork(next?.id ?? null);\n    if (next) {\n      requestAnimationFrame(() => document.getElementById(\`partner-work-\${next.id}\`)?.scrollIntoView({ behavior: "smooth", block: "center" }));\n    }\n  }`);

  source = source.replace(
    '    return <div key={work.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">',
    '    const workIndex = openItems.findIndex((item) => item.id === work.id);\n    const hasNextWork = workIndex >= 0 && workIndex < openItems.length - 1;\n    return <div id={`partner-work-${work.id}`} key={work.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">',
  );

  const expandedAnchor = '{expanded ? <div className="border-t border-slate-200 bg-slate-50/40 p-3"><PartnerWorkListV4 workItems={[work]} permissions={permissions} /></div> : null}';
  if (!source.includes(expandedAnchor)) return;
  source = source.replace(
    expandedAnchor,
    '{expanded ? <div className="border-t border-slate-200 bg-slate-50/40 p-3"><PartnerWorkListV4 workItems={[work]} permissions={permissions} /><div className="mt-3 flex justify-end"><button data-partner-next-work="true" type="button" onClick={() => advanceFrom(work.id)} className="rounded-lg bg-slate-950 px-4 py-2.5 text-xs font-black text-white">{hasNextWork ? "Next Work Order →" : "Collapse"}</button></div></div> : null}',
  );

  writeFileSync(path, source, "utf8");
}

function patchPartsConversation() {
  const path = "components/partner/partner-parts-conversation-board.tsx";
  let source = readFileSync(path, "utf8");
  if (source.includes('data-partner-parts-summary="compact-v1"')) return;

  source = source.replace('Parts offer sent to the Owner.', 'Part suggestion updated for the Owner.');
  source = source.replace('Could not send parts offer.', 'Could not update the part suggestion.');
  source = source.replace('Your offer: {money(Number(item.partner_offer_unit_price))}', 'Your suggestion: {money(Number(item.partner_offer_unit_price))}');
  source = source.replace('placeholder="Your price $"', 'placeholder="Suggested price $"');
  source = source.replace('>Send offer</button>', '>Update suggestion</button>');

  const itemAnchor = 'return <div key={item.id} className="rounded-xl border border-slate-200 p-4">';
  if (!source.includes(itemAnchor)) return;
  source = source.replace(itemAnchor, 'return <div key={item.id} data-partner-parts-summary="compact-v1" className="rounded-lg border border-slate-200 p-3">');

  const messagesAnchor = '{item.messages.length ? <div className="mt-3 space-y-2">';
  if (!source.includes(messagesAnchor)) return;
  source = source.replace(
    messagesAnchor,
    '<details className="mt-2"><summary className="cursor-pointer text-[11px] font-black text-slate-500">View details / update</summary>{item.messages.length ? <div className="mt-3 space-y-2">',
  );

  const tailAnchor = '</button></div></div>; })}</div></div>)}</div>';
  if (!source.includes(tailAnchor)) return;
  source = source.replace(tailAnchor, '</button></div></details></div>; })}</div></div>)}</div>');

  writeFileSync(path, source, "utf8");
}

patchGroupedWork();
patchPartsConversation();
console.log("Added Partner Work next-step progression and compact parts tracking.");
