import type { InventoryCarPlanData } from "@/lib/mindful-inventory/car-plan";
import type { InventoryPerformerOption } from "@/lib/mindful-inventory/performers";

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function WorkPlanRoutingSummary({
  plan,
  performers,
}: {
  plan: InventoryCarPlanData;
  performers: InventoryPerformerOption[];
}) {
  if (!plan.currentDraftVersion) return null;

  const performerById = new Map(performers.map((performer) => [performer.id, performer]));
  const activeItems = plan.draftItems.filter(
    (item) => item.decision !== "declined" && item.decision !== "monitor",
  );
  if (!activeItems.length) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">
            Authorization & Routing
          </div>
          <h3 className="mt-1 text-lg font-black text-slate-950">What approval will actually start</h3>
          <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-500">
            The Work Plan only needs to authorize the next executable step. Partner confirmation, final quotes,
            parts availability, and scheduling can remain open and are resolved in Active Work after approval.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-blue-700">
          Soft blockers may remain
        </span>
      </div>

      <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
        {activeItems.map((item) => {
          const partner = item.suggestedPartnerId ? performerById.get(item.suggestedPartnerId) : null;
          const diagnostic = item.classification === "investigate" || item.decision === "investigate";
          const quoteRequired = item.costSource === "unknown" || item.planningAmount <= 0;

          return (
            <div key={item.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_220px_220px] lg:items-center">
              <div className="min-w-0">
                <div className="font-black text-slate-900">{item.title}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">
                  {diagnostic
                    ? "Approval authorizes diagnosis / quote gathering only — not the unknown downstream repair."
                    : "Approval authorizes this work to enter Active Work."}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Partner</div>
                <div className="mt-1 text-sm font-black text-slate-800">
                  {partner ? partner.displayName : "Unassigned"}
                </div>
                <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                  {partner ? "Confirmation requested after approval" : "Assign before execution"}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">Cost status</div>
                <div className={`mt-1 text-sm font-black ${quoteRequired ? "text-amber-800" : "text-slate-800"}`}>
                  {quoteRequired ? "Quote required" : money(item.planningAmount)}
                </div>
                <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                  {quoteRequired ? "Not a hard blocker to starting the next step" : "Planning amount"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
