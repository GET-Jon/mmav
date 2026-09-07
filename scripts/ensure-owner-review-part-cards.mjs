import { readFileSync, writeFileSync } from "node:fs";

const path = "components/mindful-inventory/mechanical-owner-finding-review.tsx";
let source = readFileSync(path, "utf8");

if (source.includes("function ownerReviewPartStatus(")) {
  console.log("Owner Review suggested-part cards already installed.");
  process.exit(0);
}

const renderStart = source.indexOf("  function renderParts(finding: InventoryFindingView) {");
const renderEnd = source.indexOf("\n\n  function renderUnresolvedFinding", renderStart);
if (renderStart === -1 || renderEnd === -1) {
  throw new Error("Could not find Owner Review renderParts boundaries.");
}

const helpers = `  function ownerReviewPartStatus(part: InventoryFindingView["mechanicalSuggestedParts"][number]) {
    const notes = part.notes || "";
    if (notes.startsWith("IN STOCK ·")) return { label: "In stock ✓", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" };
    if (notes.startsWith("NOT NEEDED ·")) return { label: "Not needed", tone: "border-slate-200 bg-slate-100 text-slate-600" };
    return { label: "Purchase required", tone: "border-amber-200 bg-amber-50 text-amber-800" };
  }

  function ownerReviewPartUrl(part: InventoryFindingView["mechanicalSuggestedParts"][number]) {
    const partNumber = part.partNumber?.trim() || "";
    if (/^https?:\\/\\//i.test(partNumber)) return partNumber;
    const match = (part.notes || "").match(/https?:\\/\\/[^\\s]+/i);
    return match?.[0] || null;
  }

  function ownerReviewPartNote(part: InventoryFindingView["mechanicalSuggestedParts"][number]) {
    let note = (part.notes || "").replace(/^(IN STOCK|NOT NEEDED) · /, "").trim();
    note = note.replace(/https?:\\/\\/[^\\s]+/gi, "").trim();
    if (/^Lot Logic search:/i.test(note)) return null;
    return note || null;
  }

  function ownerReviewPartPrice(part: InventoryFindingView["mechanicalSuggestedParts"][number]) {
    if (part.partnerOfferUnitPrice !== null) return { value: money(part.partnerOfferUnitPrice), label: "Inspector price", tone: "text-emerald-700" };
    if (part.aiEstimatedUnitPriceLow !== null || part.aiEstimatedUnitPriceHigh !== null) {
      const low = part.aiEstimatedUnitPriceLow;
      const high = part.aiEstimatedUnitPriceHigh;
      const value = low !== null && high !== null ? (low === high ? money(low) : money(low) + "–" + money(high)) : money(low ?? high);
      return { value, label: "AI estimate", tone: "text-blue-700" };
    }
    return null;
  }

  function renderParts(finding: InventoryFindingView) {
    if (finding.mechanicalSuggestedParts.length) {
      return (
        <div className="mt-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Suggested parts</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">Parts considered by the inspector for this finding.</div>
            </div>
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {finding.mechanicalSuggestedParts.map((part, index) => {
              const status = ownerReviewPartStatus(part);
              const price = ownerReviewPartPrice(part);
              const sourceUrl = ownerReviewPartUrl(part);
              const note = ownerReviewPartNote(part);
              const partNumber = part.partNumber && !/^https?:\\/\\//i.test(part.partNumber) ? part.partNumber : null;
              const notNeeded = status.label === "Not needed";
              return (
                <div key={\`${'${part.description}'}-${'${index}'}\`} className={\`rounded-xl border p-3 ${'${notNeeded ? "border-slate-200 bg-slate-50/70 opacity-80" : "border-slate-200 bg-white"}'}\`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-black leading-5 text-slate-950">{part.description}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
                        <span>Qty {part.quantity}</span>
                        {partNumber ? <span>· #{partNumber}</span> : null}
                      </div>
                    </div>
                    {price ? <div className="shrink-0 text-right"><div className={\`text-sm font-black ${'${price.tone}'}\`}>{price.value}</div><div className="mt-0.5 text-[9px] font-black uppercase tracking-[0.06em] text-slate-400">{price.label}</div></div> : <div className="shrink-0 text-sm font-black text-slate-400">TBD</div>}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className={\`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.06em] ${'${status.tone}'}\`}>{status.label}</span>
                    {sourceUrl && !notNeeded ? <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-[11px] font-black text-blue-700 hover:text-blue-900">Source reference ↗</a> : null}
                  </div>
                  {note ? <div className="mt-2 text-[11px] font-semibold leading-4 text-slate-500">{note}</div> : null}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (finding.mechanicalPartsRequired) {
      return (
        <div className="mt-3 text-xs font-semibold text-slate-600">
          <span className="font-black text-slate-800">Parts needed:</span>{" "}
          {finding.mechanicalPartsRequired}
        </div>
      );
    }

    return null;
  }`;

source = source.slice(0, renderStart) + helpers + source.slice(renderEnd);
writeFileSync(path, source, "utf8");
console.log("Reworked Owner Review suggested parts into skimmable status cards.");
