import type { ReactNode } from "react";
import { monthlyCheckoutPlans } from "@/lib/billing/checkout-prices";

export const pricingPlans = [
  {
    key: "starter",
    name: "Starter",
    price: `$${monthlyCheckoutPlans.starter.amount / 100}`,
    cadence: "/month",
    alternate: "or $9/week",
    evaluations: "20 evaluations / month",
    seats: "1 user",
    note: "Best for small independents",
    featured: true,
  },
  {
    key: "dealer",
    name: "Dealer",
    price: `$${monthlyCheckoutPlans.dealer.amount / 100}`,
    cadence: "/month",
    alternate: "",
    evaluations: "75 evaluations / month",
    seats: "3 users",
    note: "Best for active dealerships",
    featured: false,
  },
  {
    key: "dealer_pro",
    name: "Dealer Pro",
    price: `$${monthlyCheckoutPlans.dealer_pro.amount / 100}`,
    cadence: "/month",
    alternate: "",
    evaluations: "200 evaluations / month",
    seats: "5 users",
    note: "Best for higher-volume teams",
    featured: false,
  },
 ] as const;

function Check() {
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-blue-600 text-[10px] font-black text-white">
      ✓
    </span>
  );
}

export type PricingPlan = (typeof pricingPlans)[number];

export function PricingPlanCards({ renderAction, showWeeklyOption = true }: { renderAction?: (plan: PricingPlan) => ReactNode; showWeeklyOption?: boolean }) {
  return <div className="grid gap-5 lg:grid-cols-3">
          {pricingPlans.map((plan) => (
            <article
              key={plan.name}
              className={`relative rounded-[26px] border bg-white p-7 shadow-[0_16px_45px_rgba(15,23,42,0.06)] ${
                plan.featured ? "border-blue-400 ring-4 ring-blue-100/60" : "border-slate-200"
              }`}
            >
              {plan.featured ? (
                <span className="absolute -top-3 left-6 rounded-full bg-blue-600 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                  Most popular
                </span>
              ) : null}
              <h3 className="text-xl font-black text-slate-950">{plan.name}</h3>
              <div className="mt-4 flex items-end gap-1">
                <span className="text-4xl font-black tracking-tight text-slate-950">{plan.price}</span>
                <span className="pb-1 text-sm font-black text-slate-500">{plan.cadence}</span>
              </div>
              <div className="mt-1 min-h-5 text-sm font-semibold text-slate-400">{showWeeklyOption ? plan.alternate : ""}</div>
              <div className="my-6 h-px bg-slate-200" />
              <div className="space-y-3 text-sm font-bold text-slate-700">
                <div className="flex items-center gap-2"><Check />{plan.evaluations}</div>
                <div className="flex items-center gap-2"><Check />{plan.seats}</div>
                <div className="flex items-center gap-2"><Check />Full evaluator access</div>
              </div>
              <div className="mt-7 rounded-xl bg-slate-50 px-4 py-3 text-center text-xs font-black text-slate-600">
                {plan.note}
              </div>
              {renderAction ? <div className="mt-5">{renderAction(plan)}</div> : null}
            </article>
          ))}
  </div>;
}
