"use client";

import { useEffect, useState } from "react";
import { PricingPlanCards, type PricingPlan } from "@/components/marketing/pricing-plan-cards";

type BillingAccess = {
  company?: { role?: string };
  billing?: { stripe_subscription_id?: string | null; plan_key?: string; status?: string };
  usage?: {
    postCancelActive?: boolean;
    postCancelBalance?: number;
    postCancelStartsAt?: string | null;
    postCancelExpiresAt?: string | null;
  };
  configuredPlans?: Record<string, boolean>;
  portalConfigured?: boolean;
};

export function PlanSelectionModal({ message, onClose }: { message: string; onClose: () => void }) {
  const [data, setData] = useState<BillingAccess | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    let cancelled = false;
    void fetch("/api/billing/status", { cache: "no-store" }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load plan availability.");
      if (!cancelled) setData(result);
    }).catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : "Unable to load plans."); });
    return () => { cancelled = true; document.body.style.overflow = previousOverflow; };
  }, []);

  const existingSubscription = Boolean(data?.billing?.stripe_subscription_id && ["active", "trialing", "past_due"].includes(data.billing.status || ""));
  const isAdmin = data?.company?.role === "company_admin";
  const creditStartMs = Date.parse(data?.usage?.postCancelStartsAt || "");
  const creditExpiryMs = Date.parse(data?.usage?.postCancelExpiresAt || "");
  const preservedPaidCredits = Math.max(0, Number(data?.usage?.postCancelBalance || 0));
  const creditsAwaitingStart =
    data?.billing?.status === "canceled" &&
    preservedPaidCredits > 0 &&
    Number.isFinite(creditStartMs) &&
    Number.isFinite(creditExpiryMs) &&
    Date.now() < creditStartMs;
  const dateTime = (ms: number) => new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(ms));

  async function choose(plan: PricingPlan) {
    setBusy(plan.key);
    setError("");
    try {
      const response = await fetch(existingSubscription ? "/api/billing/portal" : "/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey: plan.key, returnTo: "/evaluate" }),
      });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error || "Unable to open checkout.");
      window.location.assign(result.url);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to open checkout.");
      setBusy(null);
    }
  }

  // A future-dated Stripe test-clock cancellation is not a depleted balance.
  // Never pressure customers into buying again when their paid credits exist.
  if (creditsAwaitingStart) {
    return (
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <section role="dialog" aria-modal="true" aria-labelledby="scheduled-paid-credits-title"
          className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
          <p className="text-xs font-black uppercase tracking-wide text-blue-700">Cancellation credit window</p>
          <h2 id="scheduled-paid-credits-title" className="mt-2 text-2xl font-black text-slate-950">
            Your paid evaluations are preserved.
          </h2>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">
            You still have <strong>{preservedPaidCredits} unused paid evaluations</strong>.
            Your canceled subscription's 30-day usage window hasn't begun yet.
          </p>
          <dl className="mt-5 space-y-3 rounded-xl bg-blue-50 p-4 text-sm">
            <div><dt className="font-bold text-blue-800">Available starting</dt><dd className="mt-1 font-black text-blue-950">{dateTime(creditStartMs)}</dd></div>
            <div><dt className="font-bold text-blue-800">Expire on</dt><dd className="mt-1 font-black text-blue-950">{dateTime(creditExpiryMs)}</dd></div>
          </dl>
          <p className="mt-4 text-xs font-semibold leading-5 text-slate-600">
            No additional subscription is required to use these preserved credits once the window starts.
            Existing evaluations, comps, and pipeline records remain available now.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={onClose} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">
              Got it
            </button>
            <a href="/settings?tab=billing" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-blue-700">
              View billing details
            </a>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-selection-title"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-6xl overflow-y-auto rounded-[28px] bg-[#f6f8fb] p-5 shadow-2xl sm:p-8"
      >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-blue-700">Keep evaluating with Lot Logic</p>
          <h2 id="plan-selection-title" className="mt-2 text-3xl font-black tracking-tight text-slate-950">Choose the plan that fits your dealership.</h2>
          <p className="mt-3 text-sm font-semibold text-slate-600">{message}</p>
          <p className="mt-1 text-sm text-slate-500">Your existing evaluations, comps, and pipeline remain available. Choose a plan when you’re ready to start another evaluation.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close plan selection" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600">Close</button>
      </div>
      <div className="mt-8">
        <PricingPlanCards
          showBestValueBadge
          renderAction={plan => {
            const explicitlyUnavailable =
              Boolean(data) &&
              (!isAdmin ||
                (existingSubscription && !data?.portalConfigured));

            return (
              <button
                type="button"
                disabled={busy !== null || explicitlyUnavailable}
                onClick={() => void choose(plan)}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:opacity-100"
              >
                {busy === plan.key
                  ? "Opening…"
                  : existingSubscription
                    ? "Manage subscription"
                    : `Choose ${plan.name} →`}
              </button>
            );
          }}
        />
      </div>
      {data && !isAdmin ? <p className="mt-5 text-sm font-bold text-amber-800">Ask your dealership administrator to choose or upgrade your plan.</p> : null}
      {data && isAdmin && !existingSubscription && !Object.values(data.configuredPlans || {}).some(Boolean) ? <p className="mt-5 text-sm font-bold text-amber-800">Paid checkout is not available yet. Your vehicle draft is saved.</p> : null}
      {error ? <p role="alert" className="mt-5 text-sm font-bold text-red-700">{error}</p> : null}
      <div className="mt-6 grid gap-2 border-t border-slate-200 pt-5 text-xs font-bold text-slate-600 sm:grid-cols-3">
        <span>✓ Only completed valuations count</span><span>✓ Re-open existing evaluations anytime</span><span>✓ Drafts and edits don’t use another evaluation</span>
      </div>
      </section>
    </div>
  );
}
