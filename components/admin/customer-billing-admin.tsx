"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export type PlatformCustomerBillingRow = {
  companyId: string;
  companyName: string;
  companySlug: string;
  contactEmail: string | null;
  companyStatus: string;
  billingStatus: string;
  planKey: "starter" | "dealer" | "dealer_pro";
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  includedUsed: number;
  includedLimit: number;
  includedRemaining: number;
  monthlyEvaluationsUsed: number;
  activeUsers: number;
  seatsLimit: number;
  giftedRemaining: number;
  totalRemaining: number;
  stripeCustomerId: string | null;
};

function planLabel(planKey: PlatformCustomerBillingRow["planKey"]) {
  if (planKey === "dealer_pro") return "Dealer Pro";
  if (planKey === "dealer") return "Dealer";
  return "Starter";
}

function statusTone(status: string) {
  if (status === "active" || status === "comped") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "trialing") {
    return "bg-blue-50 text-blue-700";
  }
  if (status === "past_due" || status === "unpaid") {
    return "bg-red-50 text-red-700";
  }
  if (status === "canceled" || status === "paused") {
    return "bg-slate-100 text-slate-600";
  }
  return "bg-amber-50 text-amber-800";
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function GiftCredits({
  customer,
}: {
  customer: PlatformCustomerBillingRow;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(5);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    if (busy) return;
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/customers/gift-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: customer.companyId,
          amount,
          note,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        giftedEvaluationsRemaining?: number;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to gift evaluations.");
      }

      setMessage(
        `Gifted ${amount} evaluation${amount === 1 ? "" : "s"}. New gifted balance: ${payload.giftedEvaluationsRemaining || 0}.`,
      );
      setNote("");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to gift evaluations.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white hover:bg-slate-800"
      >
        Gift credits
      </button>
    );
  }

  return (
    <div className="min-w-[260px] rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={500}
          value={amount}
          onChange={(event) =>
            setAmount(
              Math.max(1, Math.min(500, Number(event.target.value || 1))),
            )
          }
          className="w-20 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-black text-slate-900 outline-none focus:border-emerald-400"
          aria-label="Evaluation credits to gift"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:bg-slate-300"
        >
          {busy ? "Gifting…" : "Gift"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setMessage("");
          }}
          disabled={busy}
          className="rounded-lg px-2 py-2 text-xs font-black text-slate-500 hover:bg-white"
        >
          Cancel
        </button>
      </div>
      <input
        type="text"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={240}
        placeholder="Optional note"
        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-400"
      />
      {message ? (
        <div className="mt-2 text-[11px] font-bold leading-4 text-slate-600">
          {message}
        </div>
      ) : null}
    </div>
  );
}

export function CustomerBillingAdmin({
  customers,
}: {
  customers: PlatformCustomerBillingRow[];
}) {
  const paid = customers.filter((item) =>
    ["active", "past_due", "comped"].includes(item.billingStatus),
  ).length;
  const trials = customers.filter(
    (item) => item.billingStatus === "trialing",
  ).length;
  const evaluationsThisMonth = customers.reduce(
    (sum, item) => sum + item.monthlyEvaluationsUsed,
    0,
  );
  const activeUsers = customers.reduce(
    (sum, item) => sum + item.activeUsers,
    0,
  );
  const giftedOutstanding = customers.reduce(
    (sum, item) => sum + item.giftedRemaining,
    0,
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Customers", customers.length],
          ["Paid", paid],
          ["Trialing", trials],
          ["Active users", activeUsers],
          ["Evaluations this month", evaluationsThisMonth],
          ["Gifted credits outstanding", giftedOutstanding],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
              {label}
            </div>
            <div className="mt-2 text-2xl font-black text-slate-950">
              {value}
            </div>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <h2 className="text-lg font-black">Customer accounts</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Plan status, included usage, gifted evaluations, and remaining buying capacity across Lot Logic customers.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1240px] text-left text-sm">
            <thead className="bg-white text-[10px] font-black uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Plan</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Users</th>
                <th className="px-5 py-3">Included usage</th>
                <th className="px-5 py-3">Gifted</th>
                <th className="px-5 py-3">Total left</th>
                <th className="px-5 py-3">Renews / trial ends</th>
                <th className="px-5 py-3">Admin action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((customer) => (
                <tr
                  key={customer.companyId}
                  className="align-top hover:bg-slate-50/70"
                >
                  <td className="px-5 py-4">
                    <div className="font-black text-slate-950">
                      {customer.companyName}
                    </div>
                    <div className="mt-0.5 text-xs font-semibold text-slate-500">
                      {customer.contactEmail || customer.companySlug}
                    </div>
                    {customer.stripeCustomerId ? (
                      <div className="mt-1 text-[10px] font-semibold text-slate-400">
                        Stripe {customer.stripeCustomerId}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-black text-slate-900">
                      {planLabel(customer.planKey)}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${statusTone(customer.billingStatus)}`}
                    >
                      {customer.billingStatus.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-black text-slate-900">
                      {customer.activeUsers} / {customer.seatsLimit}
                    </div>
                    <div className="mt-0.5 text-[11px] font-semibold text-slate-400">
                      active users / seats
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-black text-slate-900">
                      {customer.includedUsed} / {customer.includedLimit}
                    </div>
                    <div className="mt-0.5 text-[11px] font-semibold text-slate-400">
                      {customer.includedRemaining} included left
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-black ${
                        customer.giftedRemaining > 0
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {customer.giftedRemaining}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div
                      className={`text-lg font-black ${
                        customer.totalRemaining > 0
                          ? "text-slate-950"
                          : "text-red-600"
                      }`}
                    >
                      {customer.totalRemaining}
                    </div>
                  </td>
                  <td className="px-5 py-4 font-semibold text-slate-600">
                    {customer.billingStatus === "trialing"
                      ? dateLabel(customer.trialEndsAt)
                      : dateLabel(customer.currentPeriodEnd)}
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-2">
                      <GiftCredits customer={customer} />
                      <Link
                        href={`/admin/customers/${customer.companyId}`}
                        className="inline-flex text-xs font-black text-blue-700 hover:underline"
                      >
                        View account & users →
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {customers.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-12 text-center font-semibold text-slate-400"
                  >
                    No customer companies found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
