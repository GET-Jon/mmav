"use client";

import { useRef } from "react";

const plans = [
  { name: "Starter", evaluations: 20 },
  { name: "Dealer", evaluations: 75 },
  { name: "Dealer Pro", evaluations: 200 },
] as const;

export function EvaluationPlanHelpDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-extrabold text-blue-700 transition hover:bg-blue-50 hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        aria-haspopup="dialog"
      >
        <span aria-hidden="true" className="grid h-4 w-4 place-items-center rounded-full border border-current text-[10px]">?</span>
        How plan changes affect evaluations
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="evaluation-plan-help-title"
        aria-describedby="evaluation-plan-help-description"
        className="m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/55"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">Evaluation allowances</div>
            <h2 id="evaluation-plan-help-title" className="mt-1 text-xl font-black leading-tight tracking-tight sm:text-2xl">
              What happens when I change plans?
            </h2>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close evaluation allowance explanation"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-lg font-bold text-slate-600 transition hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            ×
          </button>
        </div>

        <div id="evaluation-plan-help-description" className="space-y-5 px-5 py-5 text-sm leading-6 sm:px-6">
          <p className="font-semibold text-slate-700">
            Your new plan <strong className="text-slate-950">replaces</strong> the previous monthly
            allowance; plan allowances don't stack. Any evaluations you've already completed
            during the current billing period still count toward your new limit.
          </p>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="grid grid-cols-2 bg-slate-50 px-4 py-2 text-[11px] font-black uppercase tracking-wide text-slate-500">
              <span>Plan</span>
              <span className="text-right">Evaluations / month</span>
            </div>
            {plans.map((plan) => (
              <div key={plan.name} className="grid grid-cols-2 border-t border-slate-100 px-4 py-2.5 font-semibold">
                <span>{plan.name}</span>
                <span className="text-right font-black tabular-nums">{plan.evaluations}</span>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="text-xs font-black uppercase tracking-wide text-blue-800">Example: Starter → Dealer</div>
            <p className="mt-1 text-xs font-semibold text-blue-900">
              You completed 12 evaluations this billing period and still have 5 unused free-trial evaluations.
            </p>
            <div className="mt-3 space-y-1.5 text-sm text-slate-700">
              <div className="flex justify-between gap-3"><span>New Dealer allowance</span><strong>75</strong></div>
              <div className="flex justify-between gap-3"><span>Unused trial bonus (first paid month only)</span><strong>+5</strong></div>
              <div className="flex justify-between gap-3"><span>Evaluations already completed</span><strong>−12</strong></div>
              <div className="flex justify-between gap-3 border-t border-blue-200 pt-2 text-base font-black text-blue-950">
                <span>Evaluations remaining</span><span className="tabular-nums">68</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 text-xs font-medium leading-5 text-slate-600">
            <p><strong className="text-slate-800">Free-trial bonus:</strong> Unused free evaluations carry into your first paid billing period only, and expire at its first renewal.</p>
            <p><strong className="text-slate-800">Renewal:</strong> Your monthly allowance resets at the start of your next Stripe billing period. Unused evaluations do not roll over to another paid month.</p>
            <p><strong className="text-slate-800">Cancellation:</strong> Your paid plan remains available through the end of the current billing period. After it ends, any unused <strong>paid-plan</strong> evaluations remain usable for exactly 30 days, then expire. No new monthly evaluations are issued. Free-trial bonuses never extend into this 30-day window.</p>
            <p><strong className="text-slate-800">Your work:</strong> Evaluations and pipeline records already saved remain available after cancellation or credit expiry.</p>
            <p><strong className="text-slate-800">Billing:</strong> Stripe shows any prorated price adjustment when you change plans; the evaluation allowance is not a separate credit balance.</p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Got it
          </button>
        </div>
      </dialog>
    </>
  );
}
