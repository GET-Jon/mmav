#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

python - <<'PY'
from pathlib import Path

path = Path("components/mindful-inventory/inventory-mechanical-inspection.tsx")
text = path.read_text()

def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH STOPPED: expected exactly 1 occurrence for {label}, found {count}")
    text = text.replace(old, new, 1)

replace_once(
'''  const [inspectionSaving, setInspectionSaving] = useState(false);''',
'''  const [inspectionSaving, setInspectionSaving] = useState(false);
  const [buildingWorkPlan, setBuildingWorkPlan] = useState(false);
  const [buildWorkPlanError, setBuildWorkPlanError] = useState("");''',
"work-plan transition state",
)

replace_once(
'''  async function completeInspection() {
    const saved = await persistInspection({ complete: true });
    if (saved) router.refresh();
  }''',
'''  async function buildAndOpenWorkPlan() {
    setBuildingWorkPlan(true);
    setBuildWorkPlanError("");
    setInspectionMessage("Building Work Plan…");

    try {
      const response = await fetch(
        `/api/mindful/inventory/vehicles/${vehicle.id}/work-plan/generate`,
        { method: "POST" },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to build Work Plan.");
      }

      router.push(`/mindful/inventory/${vehicle.id}/car-plan`);
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to build Work Plan.";
      setBuildWorkPlanError(message);
      setInspectionMessage("Mechanical is complete. Work Plan still needs to be built.");
      setBuildingWorkPlan(false);
    }
  }

  async function completeInspection() {
    setBuildingWorkPlan(true);
    setBuildWorkPlanError("");
    const saved = await persistInspection({ complete: true });
    if (!saved) {
      setBuildingWorkPlan(false);
      return;
    }
    await buildAndOpenWorkPlan();
  }''',
"complete-and-build flow",
)

replace_once(
'''<button type="button" onClick={completeInspection} disabled={inspectionSaving || reconciliation.pending > 0} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-300">Complete Inspection →</button>''',
'''<button type="button" onClick={completeInspection} disabled={inspectionSaving || buildingWorkPlan || reconciliation.pending > 0} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-300">{buildingWorkPlan ? "Building Work Plan…" : "Complete Inspection & Build Work Plan →"}</button>''',
"complete inspection CTA",
)

replace_once(
'''    <div className="space-y-5">
      {inspectionComplete ? (''',
'''    <div className="space-y-5">
      {buildingWorkPlan || buildWorkPlanError ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-5 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            {buildWorkPlanError ? (
              <>
                <div className="text-xs font-black uppercase tracking-[0.1em] text-red-500">Work Plan Not Built</div>
                <h3 className="mt-2 text-xl font-black text-slate-950">Mechanical is safely complete.</h3>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{buildWorkPlanError}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void buildAndOpenWorkPlan()} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Try Again</button>
                  <button type="button" onClick={() => router.push(`/mindful/inventory/${vehicle.id}/car-plan`)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700">Open Work Plan</button>
                </div>
              </>
            ) : (
              <>
                <div className="text-xs font-black uppercase tracking-[0.1em] text-violet-600">Building Work Plan</div>
                <h3 className="mt-2 text-xl font-black text-slate-950">Turning the confirmed inspection into a draft plan…</h3>
                <div className="mt-5 space-y-3 text-sm font-semibold text-slate-600">
                  <div className="flex items-center gap-3"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Mechanical inspection complete</div>
                  <div className="flex items-center gap-3"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-violet-500" /> Reconciling issues and upgrades</div>
                  <div className="flex items-center gap-3"><span className="h-2.5 w-2.5 rounded-full bg-slate-200" /> Creating draft Work Plan</div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {inspectionComplete ? (''',
"building work plan modal",
)

path.write_text(text)
print("✓ Complete Inspection now builds the Work Plan automatically")
print("✓ Added Building Work Plan transition modal")
print("✓ Added retry path without undoing completed Mechanical")
print("✓ Updated CTA to Complete Inspection & Build Work Plan")
PY

git diff --check

git add components/mindful-inventory/inventory-mechanical-inspection.tsx scripts/apply-v15-mechanical-build-flow.sh
git commit -m "Flow mechanical completion into work plan"
git push origin v15-inventory-workflow

echo "✓ V15 mechanical-to-work-plan flow committed and pushed"
