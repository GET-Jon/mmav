"use client";

import { useEffect, useState } from "react";

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
    auto_dev_enabled?: boolean;
    inventory_enabled?: boolean;
    insights_enabled?: boolean;
    advanced_market_expansion_enabled?: boolean;
  } | null;
  checkoutConfigured?: boolean;
  portalConfigured?: boolean;
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

  async function launch(action: "checkout" | "portal") {
    setActionLoading(action);
    setStatus("");

    try {
      const response = await fetch(`/api/billing/${action}`, {
        method: "POST",
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
  const isAdmin = data?.company?.role === "company_admin";
  const hasCustomer = Boolean(billing?.stripe_customer_id);

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">Billing</div>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Subscription & plan</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              Billing belongs to your company workspace. Plans can control evaluations,
              seats, market expansion, Auto.dev discovery, inventory, and other entitlements
              without tying access to one person.
            </p>
          </div>
          <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">
            {readableStatus(billing?.status)}
          </span>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Plan</div>
            <div className="mt-2 text-lg font-black capitalize text-slate-950">{billing?.plan_key || "Starter"}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Seats</div>
            <div className="mt-2 text-lg font-black text-slate-950">{billing?.seats || 1}</div>
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

        <div className="mt-5 flex flex-wrap gap-2">
          {!hasCustomer ? (
            <button
              type="button"
              disabled={!isAdmin || !data?.checkoutConfigured || actionLoading !== null}
              onClick={() => void launch("checkout")}
              className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {actionLoading === "checkout" ? "Opening checkout…" : "Start subscription"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!isAdmin || !data?.portalConfigured || actionLoading !== null}
              onClick={() => void launch("portal")}
              className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {actionLoading === "portal" ? "Opening portal…" : "Manage billing"}
            </button>
          )}

          {data && !data.checkoutConfigured ? (
            <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-800">
              Stripe wiring is ready; checkout activates when the product/price is configured for this environment.
            </div>
          ) : null}
        </div>

        {billing?.cancel_at_period_end ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            This subscription is scheduled to cancel at the end of the current billing period.
          </div>
        ) : null}

        {status ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {status}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-black text-slate-950">Current entitlements</h3>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          These controls are intentionally separate from price so plans can evolve without reworking the application.
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
