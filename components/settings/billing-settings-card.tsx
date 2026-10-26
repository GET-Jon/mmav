"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EvaluationPlanHelpDialog } from "@/components/settings/evaluation-plan-help-dialog";

type BillingStatus = {
  company?: {
    id: string;
    name: string;
    role: string;
  };
  billing?: {
    status?: string;
    plan_key?: string;
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
    stripe_price_id?: string | null;
    seats?: number | null;
    trial_ends_at?: string | null;
    current_period_end?: string | null;
    cancel_at_period_end?: boolean | null;
  };
  entitlements?: {
    plan_key?: string;
    evaluations_per_month?: number | null;
    seats_limit?: number | null;
    gifted_evaluations?: number | null;
    auto_dev_enabled?: boolean;
    inventory_enabled?: boolean;
    insights_enabled?: boolean;
    advanced_market_expansion_enabled?: boolean;
  } | null;
  usage?: {
    status?: string;
    planKey?: "starter" | "dealer" | "dealer_pro";
    trialEndsAt?: string | null;
    trialActive?: boolean;
    paidActive?: boolean;
    paidThroughCancellation?: boolean;
    paidBillingPeriodReady?: boolean;
    trialEvaluationsUsed?: number;
    trialEvaluationsRemaining?: number | null;
    monthlyEvaluationsUsed?: number;
    monthlyEvaluationsRemaining?: number | null;
    trialRolloverEvaluations?: number;
    trialRolloverEvaluationsRemaining?: number;
    firstCycleAllowance?: number;
    postCancelActive?: boolean;
    postCancelBalance?: number;
    postCancelUsed?: number;
    postCancelRemaining?: number;
    postCancelStartsAt?: string | null;
    postCancelExpiresAt?: string | null;
    giftedEvaluationsRemaining?: number | null;
    effectiveEvaluationsRemaining?: number | null;
    monthlyProviderCalls?: number;
    limits?: {
      evaluationsPerMonth?: number;
      seats?: number;
      marketSearchesPerEvaluation?: number;
      autoDevPerEvaluation?: number;
      conditionAnalysesPerEvaluation?: number;
      providerCallsPerMonth?: number;
    };
  };
  checkoutConfigured?: boolean;
  configuredPlans?: {
    starter?: boolean;
    dealer?: boolean;
    dealer_pro?: boolean;
  };
  portalConfigured?: boolean;
  recentCheckoutPaymentFailed?: boolean;
  error?: string;
};

function readableStatus(status: string | undefined) {
  if (!status || status === "not_configured") return "Not active";
  return status.replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase());
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function exactDeadline(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function BillingSettingsCard() {
  const [data, setData] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<"checkout" | "portal" | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/billing/status", { cache: "no-store" });
        const payload = (await response.json()) as BillingStatus;
        if (!response.ok) throw new Error(payload.error || "Billing failed to load.");
        if (!cancelled) setData(payload);
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Billing failed to load.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function launch(
    action: "checkout" | "portal",
    planKey: "starter" | "dealer" | "dealer_pro" = "starter",
  ) {
    setActionLoading(action);
    setStatus("");

    try {
      const response = await fetch(`/api/billing/${action}`, {
        method: "POST",
        headers: action === "checkout" ? { "Content-Type": "application/json" } : undefined,
        body: action === "checkout" ? JSON.stringify({ planKey }) : undefined,
      });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Billing action failed.");
      }
      window.location.assign(payload.url);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Billing action failed.");
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="h-5 w-36 animate-pulse rounded bg-slate-200" />
        <div className="mt-4 h-24 animate-pulse rounded-xl bg-slate-100" />
      </section>
    );
  }

  const billing = data?.billing;
  const entitlements = data?.entitlements;
  const usage = data?.usage;
  const isAdmin = data?.company?.role === "company_admin";
  const hasCustomer = Boolean(billing?.stripe_customer_id);
  const hasSubscription = Boolean(billing?.stripe_subscription_id);
  const canManageSubscription = hasSubscription && billing?.status !== "canceled";
  const cancellationScheduled = Boolean(billing?.cancel_at_period_end && billing?.status === "active");
  const cancellationEnd = billing?.current_period_end;
  const cancellationGraceUntil = cancellationEnd
    ? new Date(new Date(cancellationEnd).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const paidEvaluationsLeft = Math.max(0,
    Number(usage?.limits?.evaluationsPerMonth || 0) - Number(usage?.monthlyEvaluationsUsed || 0),
  );
  const canceled = billing?.status === "canceled";
  const hasCancellationWindow = canceled && Boolean(usage?.postCancelStartsAt && usage?.postCancelExpiresAt);
  const gracePending = hasCancellationWindow && !usage?.postCancelActive &&
    Date.parse(usage?.postCancelStartsAt || "") > Date.now();
  const graceExpired = hasCancellationWindow && !usage?.postCancelActive && !gracePending;
  const paymentDue = ["past_due", "unpaid", "paused"].includes(billing?.status || "");
  const billingPeriodUnavailable = usage?.paidActive && usage.paidBillingPeriodReady === false;

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">Billing</div>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Subscription & plan</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              Choose a plan to keep evaluating vehicles. Your plan and evaluation allowance are shared by your dealership team.
            </p>
            <Link href="/evaluate" className="mt-3 inline-block text-sm font-bold text-blue-700 hover:underline">Return to your evaluation →</Link>
          </div>
          <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">
            {readableStatus(billing?.status)}
          </span>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Plan</div>
            <div className="mt-2 text-lg font-black text-slate-950">{billing?.plan_key === "dealer_pro" ? "Dealer Pro" : billing?.plan_key === "dealer" ? "Dealer" : "Starter"}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Seats</div>
            <div className="mt-2 text-lg font-black text-slate-950">{entitlements?.seats_limit ?? usage?.limits?.seats ?? billing?.seats ?? 1}</div>
            {paymentDue ? <div className="mt-1 text-[11px] font-bold text-amber-800">Plan benefit · payment required</div> : null}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Trial ends</div>
            <div className="mt-2 text-lg font-black text-slate-950">{dateLabel(billing?.trial_ends_at)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Current period</div>
            <div className="mt-2 text-lg font-black text-slate-950">{dateLabel(billing?.current_period_end)}</div>
          </div>
        </div>

        {paymentDue ? (
          <div role="alert" className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <div className="font-black">Payment required to use paid evaluations</div>
            <p className="mt-1 font-semibold leading-6">
              Your {billing?.plan_key === "dealer_pro" ? "Dealer Pro" : billing?.plan_key === "dealer" ? "Dealer" : "Starter"} plan is on hold until Stripe confirms payment.
              Your previous evaluations and drafts remain saved. Use Manage billing to resolve the payment.
            </p>
          </div>
        ) : null}

        {usage?.trialActive && !usage?.paidActive ? (
          <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900">
            <div>
              Free trial active: {usage.trialEvaluationsRemaining ?? 0} of 5 evaluations remaining
              {usage.trialEndsAt ? ` through ${dateLabel(usage.trialEndsAt)}` : ""}.
            </div>
            {usage.giftedEvaluationsRemaining ? (
              <div className="mt-1 text-amber-800">
                Gifted evaluations: {usage.giftedEvaluationsRemaining} available · these do not expire.
              </div>
            ) : null}
            <div className="mt-1 font-semibold text-blue-800">
              No credit card is required until you choose a paid plan.
            </div>
          </div>
        ) : null}

        {usage?.trialActive && !usage?.paidActive && data?.recentCheckoutPaymentFailed ? (
          <div role="status" className="mt-3 flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <span className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-black text-amber-900">
              Payment declined
            </span>
            <p className="min-w-0 flex-1 font-semibold leading-6">
              Your last payment attempt was unsuccessful, but your free trial is unaffected. Choose a plan below to try again with a different payment method.
            </p>
          </div>
        ) : null}

        {!canManageSubscription ? (
          <div className="mt-5">
            <div className="text-xs font-black uppercase tracking-wide text-slate-400">Choose a paid plan</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {[
                { key: "starter" as const, label: "Starter · $29/mo" },
                { key: "dealer" as const, label: "Dealer · $79/mo" },
                { key: "dealer_pro" as const, label: "Dealer Pro · $149/mo" },
              ].map((plan) => (
                <button
                  key={plan.key}
                  type="button"
                  disabled={!isAdmin || actionLoading !== null}
                  onClick={() => void launch("checkout", plan.key)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-black text-slate-900 shadow-sm transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {actionLoading === "checkout" ? "Opening checkout…" : plan.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-5">
            <button
              type="button"
              disabled={!isAdmin || !data?.portalConfigured || actionLoading !== null}
              onClick={() => void launch("portal")}
              className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {actionLoading === "portal" ? "Opening portal…" : paymentDue ? "Resolve payment in Stripe" : "Manage billing"}
            </button>
          </div>
        )}

        {data && !data.checkoutConfigured ? (
          <div className="mt-3 rounded-xl bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-800">
            Paid checkout is not available yet. Your vehicle draft is saved.
          </div>
        ) : null}

        {billingPeriodUnavailable ? (
          <div role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-900">
            Your subscription is active, but Lot Logic cannot validate its current billing period yet. Paid evaluations are temporarily unavailable; saved work is unaffected. If this persists after refreshing, please contact support.
          </div>
        ) : null}

        {cancellationScheduled && cancellationEnd && cancellationGraceUntil ? (
          <div role="status" className="mt-4 space-y-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-950">
            <div className="font-black">Cancellation scheduled · No further monthly renewals</div>
            <p className="font-semibold leading-6">
              Your plan remains active until <strong>{exactDeadline(cancellationEnd)}</strong>.
              After it ends, you can use any unused <strong>paid</strong> evaluations for 30 more days,
              through <strong>{exactDeadline(cancellationGraceUntil)}</strong>.
            </p>
            <p className="font-black">Currently {paidEvaluationsLeft} paid evaluations could carry over. This number decreases as you complete evaluations.</p>
            <p className="text-xs font-semibold leading-5 text-blue-900">
              No new monthly allowance is added after cancellation. Unused free-trial bonus evaluations expire on the original billing-period end date and do not carry over. Your saved evaluations and pipeline stay accessible.
            </p>
          </div>
        ) : null}

        {hasCancellationWindow ? (
          <div role="status" className="mt-4 space-y-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-950">
            <div className="font-black">
              {usage?.postCancelActive ? "Subscription ended · 30-day evaluation window" :
                gracePending ? "Cancellation recorded · evaluation window begins at subscription end" :
                "Your 30-day evaluation window has ended"}
            </div>
            <p className="font-semibold leading-6">
              {usage?.postCancelActive
                ? `${usage.postCancelRemaining ?? 0} unused paid evaluations remain available through ${exactDeadline(usage.postCancelExpiresAt)}.`
                : gracePending
                  ? `Your unused paid evaluations become available on ${exactDeadline(usage?.postCancelStartsAt)}, and expire ${exactDeadline(usage?.postCancelExpiresAt)}.`
                  : `Unused paid evaluations expired on ${exactDeadline(usage?.postCancelExpiresAt)}.`}
            </p>
            <p className="text-xs font-semibold leading-5">
              Your subscription will not renew. No additional monthly evaluations are issued. Free-trial bonuses are not carried over. Previously saved work remains accessible. Choose a plan above to restart a paid subscription.
            </p>
          </div>
        ) : canceled ? (
          <div role="status" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            Your subscription has ended, and no paid evaluations remain available. Your saved work is retained. Choose a plan above to subscribe again.
          </div>
        ) : null}

        {status ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {status}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-1 sm:gap-3">
          <h3 className="text-lg font-black text-slate-950">Usage</h3>
          <EvaluationPlanHelpDialog />
        </div>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Only completed valuations count toward your evaluation allowance. Drafts, edits, reopened evaluations, and comp refreshes do not consume another evaluation.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Evaluations used</div>
            <div className="mt-2 text-lg font-black text-slate-950">
              {paymentDue
                ? "Paid allowance on hold"
                : canceled
                  ? usage?.postCancelActive
                    ? `${usage.postCancelRemaining ?? 0} paid evaluations left · expires ${exactDeadline(usage.postCancelExpiresAt)}`
                    : gracePending
                      ? `${usage?.postCancelBalance ?? 0} paid evaluations · available from ${exactDeadline(usage?.postCancelStartsAt)}`
                      : "No paid evaluations available"
                : billingPeriodUnavailable
                  ? `${usage?.limits?.evaluationsPerMonth ?? "—"} included · temporarily unavailable`
                  : usage?.trialActive && !usage?.paidActive
                    ? `${usage.trialEvaluationsUsed || 0} / 5 trial`
                    : `${usage?.monthlyEvaluationsUsed || 0} / ${usage?.firstCycleAllowance ?? usage?.limits?.evaluationsPerMonth ?? "—"} this billing period`}
            </div>
            {canceled ? (
              <div className="mt-2 text-[11px] font-semibold leading-5 text-slate-600">
                Fixed unused paid balance only · no monthly refill or free-trial bonus. Unused credits expire 30 days after the plan ends.
              </div>
            ) : null}
            {billingPeriodUnavailable ? (
              <div className="mt-2 text-[11px] font-semibold leading-5 text-amber-800">
                Your monthly allowance is included with Starter, Dealer, or Dealer Pro, but cannot be spent until the billing period is verified.
              </div>
            ) : null}
            {paymentDue ? (
              <div className="mt-2 text-[11px] font-semibold leading-5 text-amber-800">
                The plan includes {usage?.limits?.evaluationsPerMonth ?? "—"} evaluations per month when payment is current.
                {Number(usage?.giftedEvaluationsRemaining || 0) > 0 ? " Separately gifted evaluations remain available." : ""}
              </div>
            ) : null}
            {usage?.paidActive && (usage?.trialRolloverEvaluations || 0) > 0 ? (
              <div className="mt-2 rounded-lg bg-blue-50 px-2 py-2 text-[11px] font-semibold leading-5 text-blue-800">
                Includes {usage?.trialRolloverEvaluations} unused free-trial evaluations
                ({usage?.trialRolloverEvaluationsRemaining} remaining).
                These carry over only into your first paid billing period and expire at renewal.
              </div>
            ) : null}
            {usage?.paidActive && usage?.paidBillingPeriodReady && billing?.current_period_end ? (
              <div className="mt-1 text-[10px] font-semibold text-slate-500">
                Renews {dateLabel(billing.current_period_end)}
              </div>
            ) : null}
          </div>
          <div className="rounded-xl border border-[#D4AF37] bg-[#FFF8E1] p-4">
            <div className="text-[10px] font-black uppercase tracking-wide text-[#8A6500]">Gifted evaluations</div>
            <div className="mt-2 text-lg font-black text-slate-950">
              {usage?.giftedEvaluationsRemaining || 0}
            </div>
            <div className="mt-1 text-[10px] font-bold text-[#8A6500]">
              Do not expire
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Market searches / evaluation</div>
            <div className="mt-2 text-lg font-black text-slate-950">
              {usage?.trialActive && !usage?.paidActive ? "3" : usage?.limits?.marketSearchesPerEvaluation || "—"}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">AI recon runs / evaluation</div>
            <div className="mt-2 text-lg font-black text-slate-950">
              {usage?.trialActive && !usage?.paidActive ? "3" : usage?.limits?.conditionAnalysesPerEvaluation || "—"}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Extended data usage</div>
            <div className="mt-2 text-sm font-black text-slate-950">
              Protected by fair-use safety limits
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-black text-slate-950">{paymentDue ? "Plan benefits (on hold)" : "Current entitlements"}</h3>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          {paymentDue
            ? "These are the features included with your selected plan; paid access is unavailable until payment succeeds."
            : "Your plan controls monthly evaluations, seats, and access to supported Lot Logic capabilities."}
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Evaluations / month", entitlements?.evaluations_per_month == null ? "Unlimited / not enforced" : String(entitlements.evaluations_per_month)],
            ["Seats", entitlements?.seats_limit == null ? "Unlimited / not enforced" : String(entitlements.seats_limit)],
            ["Auto.dev discovery", entitlements?.auto_dev_enabled ? "Included" : "Not included"],
            ["Advanced market expansion", entitlements?.advanced_market_expansion_enabled ? "Included" : "Not included"],
            ["Inventory", entitlements?.inventory_enabled ? "Included" : "Not included"],
            ["Insights", entitlements?.insights_enabled ? "Included" : "Not included"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div>
              <div className="mt-2 text-sm font-black text-slate-950">{value}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
