import type { InventoryUpgradeView } from "@/lib/mindful-inventory/overview-intake";

function money(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function statusLabel(value: InventoryUpgradeView["mechanicalValidationStatus"]) {
  if (value === "feasible") return "Good to proceed";
  if (value === "feasible_with_changes") return "Change recommended";
  if (value === "not_recommended") return "Not recommended";
  if (value === "needs_info") return "Needs more info";
  return "Pending review";
}

function statusTone(value: InventoryUpgradeView["mechanicalValidationStatus"]) {
  if (value === "feasible") return "bg-emerald-100 text-emerald-800";
  if (value === "feasible_with_changes") return "bg-blue-100 text-blue-800";
  if (value === "not_recommended") return "bg-slate-200 text-slate-700";
  if (value === "needs_info") return "bg-amber-100 text-amber-800";
  return "bg-violet-100 text-violet-700";
}

export function MechanicalOwnerUpgradeReview({ upgrades }: { upgrades: InventoryUpgradeView[] }) {
  const proposed = upgrades.filter((upgrade) => upgrade.status === "proposed");
  if (!proposed.length) return null;

  return <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
    <div className="text-xs font-black uppercase tracking-[0.1em] text-violet-500">Requested Upgrades</div>
    <h2 className="mt-1 text-xl font-black text-slate-950">Review the mechanic&apos;s upgrade assessment</h2>
    <p className="mt-1 text-sm text-slate-500">These remain Owner-requested upgrades, not mechanical defects. The mechanic&apos;s review informs the Work Plan and does not automatically assign the work.</p>

    <div className="mt-4 space-y-3">{proposed.map((upgrade) => {
      const needsDifferentPartner = upgrade.mechanicalCanPerform === false && upgrade.mechanicalValidationStatus !== "not_recommended";
      return <div key={upgrade.id} className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-black text-slate-900">{upgrade.title}</div>
            {upgrade.description ? <div className="mt-1 text-sm text-slate-600">{upgrade.description}</div> : null}
            {upgrade.desiredOutcome ? <div className="mt-1 text-xs font-semibold text-violet-700">Owner goal: {upgrade.desiredOutcome}</div> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${statusTone(upgrade.mechanicalValidationStatus)}`}>{statusLabel(upgrade.mechanicalValidationStatus)}</span>
            {needsDifferentPartner ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase text-amber-800">Needs different partner</span> : null}
          </div>
        </div>

        {upgrade.mechanicalValidationNotes ? <div className="mt-3 text-sm font-semibold text-slate-600"><span className="font-black">Mechanic notes:</span> {upgrade.mechanicalValidationNotes}</div> : null}

        {upgrade.mechanicalValidationStatus !== "pending" ? <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div><div className="text-[10px] font-black uppercase text-slate-400">Recommended action</div><div className="mt-1 font-semibold text-slate-800">{upgrade.mechanicalRecommendedAction || "—"}</div></div>
            <div><div className="text-[10px] font-black uppercase text-slate-400">Labor</div><div className="mt-1 font-semibold text-slate-800">{upgrade.mechanicalLaborHours === null ? "—" : `${upgrade.mechanicalLaborHours} hr`}</div></div>
            <div><div className="text-[10px] font-black uppercase text-slate-400">Proposed labor price</div><div className="mt-1 font-semibold text-slate-800">{money(upgrade.mechanicalProposedLaborPrice)}</div></div>
            <div><div className="text-[10px] font-black uppercase text-slate-400">Inspector can perform</div><div className={`mt-1 font-black ${needsDifferentPartner ? "text-amber-800" : "text-slate-800"}`}>{upgrade.mechanicalCanPerform === null ? "—" : upgrade.mechanicalCanPerform ? "Yes" : "No — assign another partner"}</div></div>
          </div>
          {upgrade.mechanicalPartSuggestions.length ? <div className="mt-3 border-t border-slate-200 pt-3"><div className="text-[10px] font-black uppercase text-slate-400">Suggested parts</div><div className="mt-2 space-y-1.5">{upgrade.mechanicalPartSuggestions.map((part, index) => <div key={`${part.description}-${index}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"><span className="font-black">{part.quantity}× {part.description}</span>{part.partNumber ? ` · Part # ${part.partNumber}` : ""}{part.notes ? ` · ${part.notes}` : ""}</div>)}</div></div> : null}
        </div> : <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">Waiting for mechanic review.</div>}
      </div>;
    })}</div>
  </section>;
}
