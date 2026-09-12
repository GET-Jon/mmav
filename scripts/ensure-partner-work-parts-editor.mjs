import { readFileSync, writeFileSync } from "node:fs";

const path = "components/partner/partner-work-list-v4.tsx";
let source = readFileSync(path, "utf8");

if (source.includes('data-partner-work-parts-editor="ai-v1"')) {
  console.log("Partner Work parts editor already present.");
  process.exit(0);
}

const stateAnchor = '  const [availabilityText, setAvailabilityText] = useState<Record<string, string>>({});';
if (!source.includes(stateAnchor)) {
  console.log("Partner Work parts editor skipped: state anchor not found.");
  process.exit(0);
}

source = source.replace(
  stateAnchor,
  stateAnchor + '\n  const [addingPartId, setAddingPartId] = useState<string | null>(null);\n  const [partDrafts, setPartDrafts] = useState<Record<string, { description: string; quantity: string; partNumber: string; price: string; note: string; fitmentQuery: string | null; aiEstimatedUnitPriceLow: number | null; aiEstimatedUnitPriceHigh: number | null; aiPriceBasis: string | null; origin: "mechanic" | "ai" }>>({});\n  const [partCandidates, setPartCandidates] = useState<Record<string, Array<{ name: string; need: "likely_required" | "possible" | "consumable"; searchQuery: string; estimatedUnitPriceLow: number | null; estimatedUnitPriceHigh: number | null; priceBasis: string | null }>>>({});\n  const [partWorkingId, setPartWorkingId] = useState<string | null>(null);\n  const [partMessage, setPartMessage] = useState<Record<string, string>>({});',
);

const helperAnchor = '  async function updateLogistics(work: PartnerWorkItem, kind: LogisticsKind, action: "confirm" | "adjust") {';
if (!source.includes(helperAnchor)) {
  console.log("Partner Work parts editor skipped: helper anchor not found.");
  process.exit(0);
}

const helpers = `  function partnerPartDraft(work: PartnerWorkItem) {
    return partDrafts[work.id] ?? { description: "", quantity: "1", partNumber: "", price: "", note: "", fitmentQuery: null, aiEstimatedUnitPriceLow: null, aiEstimatedUnitPriceHigh: null, aiPriceBasis: null, origin: "mechanic" as const };
  }

  function aiPriceLabel(low: number | null, high: number | null) {
    if (low == null && high == null) return null;
    if (low != null && high != null) return low === high ? money(low) : \`${'${money(low)}'}–${'${money(high)}'}\`;
    return money(low ?? high);
  }

  async function suggestPartsForWork(work: PartnerWorkItem) {
    setPartWorkingId(\`ai:${'${work.id}'}\`);
    setPartMessage((current) => ({ ...current, [work.id]: "" }));
    try {
      const response = await fetch("/api/partner/parts-conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ai_suggest", workOrderId: work.id }),
      });
      const data = await payload(response) as { items?: Array<{ name: string; need: "likely_required" | "possible" | "consumable"; searchQuery: string; estimatedUnitPriceLow?: number | null; estimatedUnitPriceHigh?: number | null; priceBasis?: string | null }>; error?: string };
      if (!response.ok) throw new Error(String(data.error || "Lot Logic could not suggest parts for this job."));
      const items = (data.items || []).map((item) => ({ ...item, estimatedUnitPriceLow: item.estimatedUnitPriceLow ?? null, estimatedUnitPriceHigh: item.estimatedUnitPriceHigh ?? null, priceBasis: item.priceBasis ?? null }));
      setPartCandidates((current) => ({ ...current, [work.id]: items }));
      if (!items.length) setPartMessage((current) => ({ ...current, [work.id]: "Lot Logic did not identify a clear purchasable part or material for this job." }));
    } catch (error) {
      setPartMessage((current) => ({ ...current, [work.id]: error instanceof Error ? error.message : "Lot Logic could not suggest parts for this job." }));
    } finally {
      setPartWorkingId(null);
    }
  }

  function usePartCandidate(work: PartnerWorkItem, candidate: { name: string; searchQuery: string; estimatedUnitPriceLow: number | null; estimatedUnitPriceHigh: number | null; priceBasis: string | null }) {
    setPartDrafts((current) => ({ ...current, [work.id]: { description: candidate.name, quantity: "1", partNumber: "", price: "", note: "", fitmentQuery: candidate.searchQuery, aiEstimatedUnitPriceLow: candidate.estimatedUnitPriceLow, aiEstimatedUnitPriceHigh: candidate.estimatedUnitPriceHigh, aiPriceBasis: candidate.priceBasis, origin: "ai" } }));
  }

  async function sendPartSuggestion(work: PartnerWorkItem) {
    const draft = partnerPartDraft(work);
    if (!draft.description.trim()) return;
    setPartWorkingId(\`send:${'${work.id}'}\`);
    setPartMessage((current) => ({ ...current, [work.id]: "" }));
    try {
      const response = await fetch("/api/partner/parts-conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "suggest",
          workOrderId: work.id,
          description: draft.description,
          quantity: draft.quantity,
          partNumber: draft.partNumber,
          unitPrice: draft.price || null,
          note: draft.note || (draft.origin === "ai" ? "Lot Logic suggested this part and the partner confirmed it belongs in the job." : "Partner added this part to the Work Order."),
          fitmentQuery: draft.fitmentQuery,
          origin: draft.origin,
          aiEstimatedUnitPriceLow: draft.aiEstimatedUnitPriceLow,
          aiEstimatedUnitPriceHigh: draft.aiEstimatedUnitPriceHigh,
          aiPriceBasis: draft.aiPriceBasis,
        }),
      });
      const data = await payload(response);
      if (!response.ok) throw new Error(String(data.error || "Could not add this part."));
      setPartMessage((current) => ({ ...current, [work.id]: "Part sent to the Owner for approval." }));
      setPartDrafts((current) => ({ ...current, [work.id]: { description: "", quantity: "1", partNumber: "", price: "", note: "", fitmentQuery: null, aiEstimatedUnitPriceLow: null, aiEstimatedUnitPriceHigh: null, aiPriceBasis: null, origin: "mechanic" } }));
      setPartCandidates((current) => ({ ...current, [work.id]: [] }));
      setAddingPartId(null);
      router.refresh();
    } catch (error) {
      setPartMessage((current) => ({ ...current, [work.id]: error instanceof Error ? error.message : "Could not add this part." }));
    } finally {
      setPartWorkingId(null);
    }
  }

`;
source = source.replace(helperAnchor, helpers + helperAnchor);

const partsStart = source.indexOf('          <div className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">2 · Parts</div>');
const locationStart = partsStart === -1 ? -1 : source.indexOf('\n\n          <div className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">3 · Location</div>', partsStart);

if (partsStart === -1 || locationStart === -1) {
  console.log("Partner Work parts editor skipped: Parts card boundary not found.");
  process.exit(0);
}

const partsCard = `          <div data-partner-work-parts-editor="ai-v1" className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">2 · Parts</div>
                <div className="mt-1 text-sm font-black">{work.parts.length ? \`${'${work.parts.length}'} tracked part${'${work.parts.length === 1 ? "" : "s"}'}\` : "No parts listed"}</div>
                <div className={\`mt-1 text-xs font-bold ${'${partsConfirmed ? "text-emerald-700" : "text-amber-700"}'}\`}>{partsConfirmed ? "✓ Parts plan confirmed" : "Confirm the parts are correct, or add what the job needs."}</div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {!partsConfirmed ? <button disabled={workingId === work.id} onClick={() => void updateLogistics(work, "parts", "confirm")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white">Confirm</button> : null}
                <button type="button" onClick={() => setAddingPartId(addingPartId === work.id ? null : work.id)} className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-black text-violet-800">+ Add part</button>
                <button onClick={() => setEditingLogistics(editingLogistics?.workId === work.id && editingLogistics.kind === "parts" ? null : { workId: work.id, kind: "parts" })} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black">Report issue</button>
              </div>
            </div>

            {partMessage[work.id] ? <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-900">{partMessage[work.id]}</div> : null}

            {addingPartId === work.id ? (() => {
              const draft = partnerPartDraft(work);
              const candidates = partCandidates[work.id] || [];
              return <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div><div className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-700">Add to this Work Order</div><div className="mt-1 text-xs font-semibold text-slate-600">Enter the part yourself or let Lot Logic suggest likely parts. New spend still goes to the Owner for approval.</div></div>
                  <button type="button" disabled={partWorkingId === \`ai:${'${work.id}'}\`} onClick={() => void suggestPartsForWork(work)} className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-black text-violet-800 disabled:opacity-40">{partWorkingId === \`ai:${'${work.id}'}\` ? "Thinking…" : "Suggest with Lot Logic"}</button>
                </div>

                {candidates.length ? <div className="mt-3 grid gap-2 lg:grid-cols-2">{candidates.map((candidate) => <div key={candidate.name} className="rounded-lg border border-violet-200 bg-white p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-black text-slate-950">{candidate.name}</div><div className="mt-0.5 text-[10px] font-black uppercase text-violet-600">{candidate.need === "likely_required" ? "Likely required" : candidate.need === "consumable" ? "Consumable" : "Possible"}</div>{aiPriceLabel(candidate.estimatedUnitPriceLow, candidate.estimatedUnitPriceHigh) ? <div className="mt-1 text-xs font-black text-blue-700">AI estimate: {aiPriceLabel(candidate.estimatedUnitPriceLow, candidate.estimatedUnitPriceHigh)}</div> : null}</div><button type="button" onClick={() => usePartCandidate(work, candidate)} className="shrink-0 rounded-lg bg-violet-700 px-3 py-2 text-[10px] font-black text-white">Use</button></div></div>)}</div> : null}

                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.7fr_80px_140px_140px]">
                  <input value={draft.description} onChange={(e) => setPartDrafts((current) => ({ ...current, [work.id]: { ...draft, description: e.target.value, origin: draft.origin } }))} placeholder="Part / material" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs" />
                  <input inputMode="decimal" value={draft.quantity} onChange={(e) => setPartDrafts((current) => ({ ...current, [work.id]: { ...draft, quantity: e.target.value } }))} placeholder="Qty" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs" />
                  <input value={draft.partNumber} onChange={(e) => setPartDrafts((current) => ({ ...current, [work.id]: { ...draft, partNumber: e.target.value } }))} placeholder="Part #" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs" />
                  <input inputMode="decimal" value={draft.price} onChange={(e) => setPartDrafts((current) => ({ ...current, [work.id]: { ...draft, price: e.target.value } }))} placeholder="My cost $" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs" />
                </div>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row"><input value={draft.note} onChange={(e) => setPartDrafts((current) => ({ ...current, [work.id]: { ...draft, note: e.target.value } }))} placeholder="Optional note — sourcing, fitment, why it is needed…" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs" /><button type="button" disabled={!draft.description.trim() || partWorkingId === \`send:${'${work.id}'}\`} onClick={() => void sendPartSuggestion(work)} className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-40">{partWorkingId === \`send:${'${work.id}'}\` ? "Sending…" : "Send for Owner approval"}</button></div>
              </div>;
            })() : null}

            {work.parts.length ? <div className="mt-3 space-y-2">{work.parts.map((part) => <div key={part.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"><div><div className="text-sm font-black">{part.description}</div>{part.etaAt ? <div className="mt-0.5 text-xs text-slate-500">ETA {dateTime(part.etaAt)}</div> : null}</div><span className="text-[10px] font-black uppercase text-slate-500">{part.dependencyResolution ? label(part.dependencyResolution) : label(part.status)}</span></div>)}</div> : null}
            {editingLogistics?.workId === work.id && editingLogistics.kind === "parts" ? <div className="mt-3 border-t border-slate-200 pt-3"><textarea rows={2} value={notes[\`${'${work.id}'}:parts\`] || ""} onChange={(e) => setNotes((current) => ({ ...current, [\`${'${work.id}'}:parts\`]: e.target.value }))} placeholder="Missing part, wrong part, hardware issue, or other change…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button onClick={() => void updateLogistics(work, "parts", "adjust")} className="mt-2 rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white">Send update</button></div> : null}
          </div>`;

source = source.slice(0, partsStart) + partsCard + source.slice(locationStart);
writeFileSync(path, source, "utf8");
console.log("Added AI-assisted Partner Work parts editor with Owner approval routing.");
