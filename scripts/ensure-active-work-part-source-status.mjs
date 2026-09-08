import { readFileSync, writeFileSync } from "node:fs";

const path = "components/mindful-inventory/inventory-part-suggestions-v4.tsx";
let source = readFileSync(path, "utf8");
let changed = false;

function replaceIfPresent(oldText, newText) {
  if (source.includes(newText)) return;
  if (!source.includes(oldText)) return;
  source = source.replace(oldText, newText);
  changed = true;
}

const sourceHelperAnchor = [
  '  function sourceLabel(part: InventoryPartView) {',
  '    const source = sourceFor(part);',
  '    if (!source) return null;',
  '    return sourceChoices.find((item) => item.value === source)?.label || labelize(source);',
  '  }',
].join('\n');

const sourceHelpers = [
  sourceHelperAnchor,
  '  function fulfillmentLabel(part: InventoryPartView) {',
  '    const source = sourceFor(part);',
  '    if (source === "in_stock") return "In stock";',
  '    if (source === "partner_supplied") return "Partner supplied";',
  '    if (source === "customer_supplied") return "Customer supplied";',
  '    if (source === "not_required") return "Not required";',
  '    if (source === "purchased") return "Mindful sourced";',
  '    return null;',
  '  }',
  '  function fulfillmentClass(part: InventoryPartView) {',
  '    const source = sourceFor(part);',
  '    if (source === "in_stock") return "bg-emerald-50 text-emerald-700";',
  '    if (source === "partner_supplied") return "bg-blue-50 text-blue-700";',
  '    if (source === "customer_supplied") return "bg-violet-50 text-violet-700";',
  '    if (source === "not_required") return "bg-slate-100 text-slate-600";',
  '    if (source === "purchased") return "bg-cyan-50 text-cyan-700";',
  '    return "bg-slate-100 text-slate-500";',
  '  }',
  '  function lifecycleLabel(part: InventoryPartView) {',
  '    const source = sourceFor(part);',
  '    if (source === "not_required") return null;',
  '    if (source === "in_stock") return part.status === "installed" ? "Installed" : null;',
  '    if (part.status === "backordered") return "Delayed";',
  '    if (part.status === "ordered") return "Ordered";',
  '    if (part.status === "received") return "Received";',
  '    if (part.status === "installed") return "Installed";',
  '    return null;',
  '  }',
  '  function lifecycleClass(part: InventoryPartView) {',
  '    if (part.status === "backordered") return "bg-amber-50 text-amber-800";',
  '    if (part.status === "ordered") return "bg-blue-50 text-blue-700";',
  '    return "bg-emerald-50 text-emerald-700";',
  '  }',
  '  function partDetailLine(part: InventoryPartView) {',
  '    const source = sourceFor(part);',
  '    const pieces: string[] = [];',
  '    if (part.supplier) pieces.push(part.supplier);',
  '    else if (source === "partner_supplied") pieces.push("Partner supplied");',
  '    else if (source === "in_stock") pieces.push("In stock");',
  '    else if (source === "customer_supplied") pieces.push("Customer supplied");',
  '    else if (source === "not_required") pieces.push("Not required");',
  '    else if (source === "purchased") pieces.push("Mindful sourced");',
  '    else pieces.push("Source not entered");',
  '',
  '    if (part.etaAt && !["in_stock", "not_required"].includes(source || "")) pieces.push(`Expected ${shortDate(part.etaAt)}`);',
  '    if (part.quotedUnitPrice != null) pieces.push(money(part.quotedUnitPrice));',
  '    return pieces.join(" · ");',
  '  }',
].join('\n');

if (source.includes(sourceHelperAnchor) && !source.includes('function fulfillmentLabel(part: InventoryPartView)')) {
  source = source.replace(sourceHelperAnchor, sourceHelpers);
  changed = true;
}

const recommendedOld = '{existing ? <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${existing.status === "backordered" ? "bg-amber-50 text-amber-800" : existing.status === "received" || existing.status === "installed" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>{existing.status === "backordered" ? "Delayed" : labelize(existing.status)}</span> : null}';
const recommendedNew = '{existing && fulfillmentLabel(existing) ? <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${fulfillmentClass(existing)}`}>{fulfillmentLabel(existing)}</span> : null}{existing && lifecycleLabel(existing) ? <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${lifecycleClass(existing)}`}>{lifecycleLabel(existing)}</span> : null}';
replaceIfPresent(recommendedOld, recommendedNew);

replaceIfPresent(
  '{existing ? `${existing.supplier || sourceLabel(existing) || "Source not entered"} · Expected ${shortDate(existing.etaAt)} · ${money(existing.quotedUnitPrice)}` : rec.searchQuery}',
  '{existing ? partDetailLine(existing) : rec.searchQuery}',
);

const unmatchedOld = '<span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${part.status === "backordered" ? "bg-amber-50 text-amber-800" : part.status === "received" || part.status === "installed" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>{part.status === "backordered" ? "Delayed" : labelize(part.status)}</span>';
const unmatchedNew = '{fulfillmentLabel(part) ? <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${fulfillmentClass(part)}`}>{fulfillmentLabel(part)}</span> : null}{lifecycleLabel(part) ? <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${lifecycleClass(part)}`}>{lifecycleLabel(part)}</span> : null}';
replaceIfPresent(unmatchedOld, unmatchedNew);

replaceIfPresent(
  '{part.supplier || sourceLabel(part) || "Source not entered"} · Expected {shortDate(part.etaAt)} · {money(part.quotedUnitPrice)}',
  '{partDetailLine(part)}',
);

const receivedOld = [
  '    if (part.status === "received") {',
  '      return <div className="flex flex-wrap items-center gap-1.5"><span className="rounded-full border-2 border-emerald-600 bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-800">✓ Received</span><button type="button" onClick={() => openOrder(key, part)} className="rounded-md border border-slate-200 px-3 py-1.5 text-[10px] font-black text-slate-600">Edit</button></div>;',
  '    }',
].join('\n');
const receivedNew = [
  '    if (part.status === "received") {',
  '      const fulfillment = sourceFor(part);',
  '      if (fulfillment === "in_stock") {',
  '        return <div className="flex flex-wrap items-center gap-1.5"><span className="rounded-full border-2 border-emerald-600 bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-800">✓ In stock</span><button type="button" onClick={() => openOrder(key, part)} className="rounded-md border border-slate-200 px-3 py-1.5 text-[10px] font-black text-slate-600">Edit</button></div>;',
  '      }',
  '      if (fulfillment === "not_required") {',
  '        return <div className="flex flex-wrap items-center gap-1.5"><span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-[9px] font-black text-slate-600">Not required</span><button type="button" onClick={() => openOrder(key, part)} className="rounded-md border border-slate-200 px-3 py-1.5 text-[10px] font-black text-slate-600">Edit</button></div>;',
  '      }',
  '      return <div className="flex flex-wrap items-center gap-1.5"><span className="rounded-full border-2 border-emerald-600 bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-800">✓ Received</span><button type="button" onClick={() => openOrder(key, part)} className="rounded-md border border-slate-200 px-3 py-1.5 text-[10px] font-black text-slate-600">Edit</button></div>;',
  '    }',
].join('\n');
replaceIfPresent(receivedOld, receivedNew);

if (changed) {
  writeFileSync(path, source, "utf8");
  console.log("Separated Active Work part fulfillment from lifecycle status.");
} else {
  console.log("Active Work part fulfillment/lifecycle status already aligned.");
}
