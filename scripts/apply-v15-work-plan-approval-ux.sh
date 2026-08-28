#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

python - <<'PY'
from pathlib import Path

path = Path("components/mindful-inventory/inventory-work-plan.tsx")
text = path.read_text()

# Add quick decision helper before approved-version branch.
anchor = '''  if (plan.currentApprovedVersion) {'''
helper = '''  async function quickDecision(item: InventoryPlanItemView, nextDecision: InventoryPlanItemDecision) {
    setWorking(true);
    setMessage("");
    try {
      const response = await fetch(`/api/mindful/inventory/vehicles/${vehicleId}/car-plan/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          title: item.title,
          description: item.description || "",
          category: item.category,
          classification: item.classification,
          decision: nextDecision,
          priority: item.priority,
          planningAmount: item.planningAmount,
          estimatedCostLow: item.estimatedCostLow,
          estimatedCostHigh: item.estimatedCostHigh,
          estimatedLaborHours: item.estimatedLaborHours,
          estimatedElapsedHours: item.estimatedElapsedHours ?? item.estimatedDurationHours,
          rationale: item.rationale || "",
          costSource: item.costSource,
          costSourceDetail: item.costSourceDetail || "",
          managerInvestigationRequired: nextDecision === "investigate" ? true : item.managerInvestigationRequired,
          declineReason: nextDecision === "declined" ? (item.declineReason || "Deferred during manager approval") : "",
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to update Plan Item.");
      setMessage(nextDecision === "declined" ? "Item deferred." : nextDecision === "approved" ? "Item included." : "Item updated.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update Plan Item.");
    } finally {
      setWorking(false);
    }
  }

'''
if anchor not in text:
    raise SystemExit("PATCH STOPPED: approved plan anchor not found")
text = text.replace(anchor, helper + anchor, 1)

# Rename empty state / build language.
text = text.replace('''        <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Work Plan</div>\n        <h2 className="mt-1 text-2xl font-black text-slate-950">Preliminary Work Plan</h2>\n        <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">Build the proposed scope from Intake, Mechanical, Lot Logic and requested upgrades. Nothing becomes authorized work until you approve the Draft.</p>''', '''        <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Build Work Plan</div>\n        <h2 className="mt-1 text-2xl font-black text-slate-950">Build Work Plan</h2>\n        <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">Turn the validated Mechanical scope into the manager approval draft. Nothing becomes authorized work until you approve it.</p>''', 1)
text = text.replace('''{working ? "Building Work Plan…" : "Build Preliminary Work Plan"}''', '''{working ? "Building Work Plan…" : "Build Work Plan"}''', 1)

# Replace main draft review UI, preserving editor modal below.
start = text.find('''  return (\n    <div className="space-y-5">''')
if start == -1:
    raise SystemExit("PATCH STOPPED: main return start not found")
editor_marker = '''      {(editingItem || addingItem) ? ('''
editor = text.find(editor_marker, start)
if editor == -1:
    raise SystemExit("PATCH STOPPED: editor modal anchor not found")

new_main = r'''  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Build Work Plan</div>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Final manager approval</h2>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">Mechanical established what is true. Confirm what Mindful will actually authorize, make only the exceptions you need, then create Active Work.</p>
            {plan.currentDraftVersion.aiSummary ? <p className="mt-3 max-w-4xl text-sm font-semibold text-slate-700">{plan.currentDraftVersion.aiSummary}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <span className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">{activeItems.length} included</span>
            <span className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">{hourLabel(laborTotal)} labor</span>
            <span className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">{money(plan.currentDraftVersion.planningTotal)} plan</span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={openAdd} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700">+ Add Work Item</button>
          {investigationCount > 0 ? <span className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">{investigationCount} investigation{investigationCount === 1 ? "" : "s"}</span> : null}
          {deferredItems.length > 0 ? <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">{deferredItems.length} deferred / monitor</span> : null}
          {message ? <span className="text-sm font-bold text-slate-600">{message}</span> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-black text-slate-950">Approval Review</h3>
            <p className="mt-1 text-sm text-slate-500">Scan the proposed scope. Include it, defer it, or open Edit only when something needs to change.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">v{plan.currentDraftVersion.versionNumber}</span>
        </div>

        <div className="mt-4 space-y-2">
          {activeItems.map((item) => {
            const sourceFindings = item.findingIds.map((id) => findingsById.get(id)).filter(Boolean);
            const sourceUpgrade = item.upgradeId ? upgradesById.get(item.upgradeId) : null;
            const turnaround = item.estimatedElapsedHours ?? item.estimatedDurationHours;
            return (
              <article key={item.id} className="rounded-xl border border-slate-200 px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-black text-slate-950">{item.title}</h4>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-700">{labelize(item.classification)}</span>
                      {item.managerInvestigationRequired || item.decision === "investigate" ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase text-amber-800">Investigate</span> : null}
                      {sourceUpgrade ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase text-blue-700">Upgrade</span> : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-slate-500">
                      <span>{money(item.planningAmount)}</span>
                      <span>{hourLabel(item.estimatedLaborHours)} labor</span>
                      <span>{hourLabel(turnaround)} turnaround</span>
                      <span>Priority {item.priority}</span>
                    </div>
                    {item.description ? <p className="mt-2 text-sm text-slate-600">{item.description}</p> : null}
                    {sourceFindings.length > 0 ? <div className="mt-2 text-xs font-semibold text-slate-400">Based on: {sourceFindings.map((finding) => finding!.title).join(" · ")}</div> : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {item.decision !== "approved" ? <button disabled={working} type="button" onClick={() => void quickDecision(item, "approved")} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 disabled:opacity-50">Include</button> : <span className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">Included</span>}
                    <button disabled={working} type="button" onClick={() => void quickDecision(item, "declined")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 disabled:opacity-50">Defer</button>
                    <button type="button" onClick={() => openEdit(item)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">Edit</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {deferredItems.length > 0 ? (
        <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer font-black text-slate-800">Deferred / Monitor ({deferredItems.length})</summary>
          <div className="mt-4 space-y-2">
            {deferredItems.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 rounded-xl bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-black text-slate-700">{item.title}</div>
                  <div className="mt-1 text-xs font-bold text-slate-400">{item.decision === "declined" ? `Deferred${item.declineReason ? ` — ${item.declineReason}` : ""}` : "Monitor / no work now"}</div>
                </div>
                <div className="flex gap-2">
                  <button disabled={working} type="button" onClick={() => void quickDecision(item, "approved")} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700 disabled:opacity-50">Include</button>
                  <button type="button" onClick={() => openEdit(item)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">Edit</button>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <section className="rounded-2xl border border-slate-300 bg-slate-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Final Authorization</div>
            <h3 className="mt-1 text-lg font-black text-slate-950">{activeItems.length} items · {money(plan.currentDraftVersion.planningTotal)} · {hourLabel(laborTotal)} labor</h3>
            <p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">Approval freezes this version as the authorized baseline and creates Active Work from the included scope. Later material changes require a new version.</p>
          </div>
          <button disabled={working || activeItems.length === 0} type="button" onClick={activatePlan} className="shrink-0 rounded-xl bg-slate-950 px-6 py-3 text-sm font-black text-white disabled:bg-slate-300">{working ? "Creating Active Work…" : "Approve & Build Active Work →"}</button>
        </div>
      </section>

'''

text = text[:start] + new_main + text[editor:]

# Simplify editor labels while preserving detail-on-demand.
text = text.replace('''<div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Work Plan Editor</div>''', '''<div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Work Item Details</div>''', 1)
text = text.replace('''{editingItem ? "Edit Plan Item" : "Add Manager Work Item"}''', '''{editingItem ? "Edit Work Item" : "Add Work Item"}''', 1)
text = text.replace('''Change the intended scope without altering the underlying Mechanical finding.''', '''Override scope, budget, priority, timing, or authorization only when needed.''', 1)

path.write_text(text)
print("✓ Work Plan redesigned as fast manager approval review")
PY

# Targeted type/build validation. Do not block on known repo-wide lint debt.
npx tsc --noEmit

git add components/mindful-inventory/inventory-work-plan.tsx
git commit -m "Simplify work plan into manager approval review"
git push origin v15-inventory-workflow

rm -f scripts/apply-v15-work-plan-approval-ux.sh scripts/apply-v15-mechanical-ux.sh scripts/apply-v15-mechanical-build-flow.sh
git status --short
