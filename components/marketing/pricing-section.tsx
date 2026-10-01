import Link from "next/link";

const plans = [
  {
    name: "Starter",
    price: "$29",
    cadence: "/month",
    alternate: "or $9/week",
    evaluations: "20 evaluations / month",
    seats: "1 user",
    note: "Best for small independents",
    featured: true,
  },
  {
    name: "Dealer",
    price: "$79",
    cadence: "/month",
    alternate: "",
    evaluations: "75 evaluations / month",
    seats: "3 users",
    note: "Best for active dealerships",
    featured: false,
  },
  {
    name: "Dealer Pro",
    price: "$149",
    cadence: "/month",
    alternate: "",
    evaluations: "200 evaluations / month",
    seats: "5 users",
    note: "Best for higher-volume teams",
    featured: false,
  },
];

function Check() {
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-blue-600 text-[10px] font-black text-white">
      ✓
    </span>
  );
}

export function PricingSection({ standalone = false }: { standalone?: boolean }) {
  return (
    <section id="pricing" className={standalone ? "bg-[#f6f8fb]" : "border-y border-slate-200 bg-[#f6f8fb]"}>
      <div className="mx-auto max-w-[1240px] px-5 py-20 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">
            No credit card required to start
          </div>
          <h2 className="mt-5 text-4xl font-black tracking-[-0.045em] text-slate-950 sm:text-5xl">
            Simple pricing for independent dealers.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg font-medium leading-8 text-slate-600">
            Start with 5 full evaluations free. If Lot Logic earns a place in your buying process,
            choose the plan that fits your dealership.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-4xl gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
          {[
            ["1", "Create your account"],
            ["2", "Get 5 free evaluations"],
            ["3", "Upgrade when you’re ready"],
          ].map(([number, label]) => (
            <div key={number} className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-600 text-xs font-black text-white">
                {number}
              </span>
              <span className="text-sm font-black text-slate-800">{label}</span>
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
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
              <div className="mt-1 min-h-5 text-sm font-semibold text-slate-400">{plan.alternate}</div>
              <div className="my-6 h-px bg-slate-200" />
              <div className="space-y-3 text-sm font-bold text-slate-700">
                <div className="flex items-center gap-2"><Check />{plan.evaluations}</div>
                <div className="flex items-center gap-2"><Check />{plan.seats}</div>
                <div className="flex items-center gap-2"><Check />Full evaluator access</div>
              </div>
              <div className="mt-7 rounded-xl bg-slate-50 px-4 py-3 text-center text-xs font-black text-slate-600">
                {plan.note}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8 grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-3">
          <div className="text-sm font-bold text-slate-700">✓ Only completed valuations count</div>
          <div className="text-sm font-bold text-slate-700">✓ Re-open existing evaluations anytime</div>
          <div className="text-sm font-bold text-slate-700">✓ Drafts, edits, and comp refreshes don’t use another evaluation</div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-4 rounded-[24px] bg-blue-600 px-6 py-6 text-white sm:flex-row lg:px-8">
          <div>
            <div className="text-xl font-black">Start with 5 free evaluations — no credit card required.</div>
            <div className="mt-1 text-sm font-semibold text-blue-100">Your trial lasts up to 14 days.</div>
          </div>
          <Link
            href="/signup"
            className="shrink-0 rounded-xl bg-white px-5 py-3 text-sm font-black text-blue-700 shadow-sm hover:bg-blue-50"
          >
            Get started free →
          </Link>
        </div>
      </div>
    </section>
  );
}
