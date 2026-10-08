import Link from "next/link";
import { notFound } from "next/navigation";

import { AppTopNav } from "@/components/navigation/app-top-nav";
import { getPlatformAdminAccess } from "@/lib/admin/platform-admin";
import { PLAN_LIMITS, TRIAL_LIMITS, type PlanKey } from "@/lib/billing/usage";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    companyId: string;
  }>;
};

function normalizePlanKey(value: unknown): PlanKey {
  const key = String(value || "").trim().toLowerCase();
  if (key === "dealer" || key === "dealer_pro") return key;
  return "starter";
}

function readableStatus(value: unknown) {
  const status = String(value || "not_configured");
  return status.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null | undefined, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime
      ? { hour: "numeric", minute: "2-digit" }
      : {}),
  }).format(date);
}

function monthStartIso() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}

function isPaidStatus(status: string) {
  return status === "active" || status === "past_due" || status === "comped";
}

export default async function AdminCustomerDetailPage({ params }: PageProps) {
  const access = await getPlatformAdminAccess();
  if (!access) notFound();

  const { companyId } = await params;
  const admin = access.admin;

  const [
    { data: company, error: companyError },
    { data: billing, error: billingError },
    { data: entitlements, error: entitlementError },
    { data: memberships, error: membershipError },
    { data: creditLedger, error: creditLedgerError },
    { count: completedAllTime, error: completedAllTimeError },
    { count: completedThisMonth, error: completedThisMonthError },
    { count: marketSearchesThisMonth, error: marketSearchError },
    { count: providerCallsThisMonth, error: providerCallError },
  ] = await Promise.all([
    admin
      .from("companies")
      .select("id,name,slug,status,created_at")
      .eq("id", companyId)
      .maybeSingle(),
    admin
      .from("company_billing_accounts")
      .select(
        "status,plan_key,stripe_customer_id,stripe_subscription_id,stripe_price_id,seats,trial_ends_at,current_period_end,cancel_at_period_end",
      )
      .eq("company_id", companyId)
      .maybeSingle(),
    admin
      .from("company_entitlements")
      .select(
        "plan_key,evaluations_per_month,seats_limit,gifted_evaluations,auto_dev_enabled,inventory_enabled,insights_enabled,advanced_market_expansion_enabled",
      )
      .eq("company_id", companyId)
      .maybeSingle(),
    admin
      .from("company_memberships")
      .select("id,user_id,role,status,created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true }),
    admin
      .from("company_evaluation_credit_ledger")
      .select("id,delta,reason,subject_key,granted_by,note,created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(25),
    admin
      .from("company_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("event_type", "evaluation_completed"),
    admin
      .from("company_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("event_type", "evaluation_completed")
      .gte("created_at", monthStartIso()),
    admin
      .from("company_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("event_type", "market_search")
      .gte("created_at", monthStartIso()),
    admin
      .from("company_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("event_type", "provider_api_call")
      .gte("created_at", monthStartIso()),
  ]);

  if (companyError) throw new Error(companyError.message);
  if (!company) notFound();
  if (billingError) throw new Error(billingError.message);
  if (entitlementError) throw new Error(entitlementError.message);
  if (membershipError) throw new Error(membershipError.message);
  if (creditLedgerError) throw new Error(creditLedgerError.message);
  if (completedAllTimeError) throw new Error(completedAllTimeError.message);
  if (completedThisMonthError) throw new Error(completedThisMonthError.message);
  if (marketSearchError) throw new Error(marketSearchError.message);
  if (providerCallError) throw new Error(providerCallError.message);

  const members = await Promise.all(
    (memberships || []).map(async (membership) => {
      const { data } = await admin.auth.admin.getUserById(
        String(membership.user_id),
      );
      const user = data?.user;
      return {
        id: String(membership.id),
        userId: String(membership.user_id),
        email: user?.email || "Unknown user",
        role: String(membership.role || "user"),
        status: String(membership.status || "active"),
        addedAt: membership.created_at ? String(membership.created_at) : null,
        lastSignInAt: user?.last_sign_in_at || null,
      };
    }),
  );

  const planKey = normalizePlanKey(billing?.plan_key || entitlements?.plan_key);
  const billingStatus = String(billing?.status || "not_configured");
  const paid = isPaidStatus(billingStatus);
  const trialEndsAt = billing?.trial_ends_at
    ? String(billing.trial_ends_at)
    : null;
  const trialActive =
    billingStatus === "trialing" &&
    Boolean(trialEndsAt && new Date(trialEndsAt).getTime() > Date.now());

  const includedLimit =
    Number(entitlements?.evaluations_per_month || 0) ||
    (paid
      ? PLAN_LIMITS[planKey].evaluationsPerMonth
      : TRIAL_LIMITS.evaluationsTotal);
  const includedUsed = paid
    ? Number(completedThisMonth || 0)
    : Math.min(TRIAL_LIMITS.evaluationsTotal, Number(completedAllTime || 0));
  const includedRemaining = paid
    ? Math.max(0, includedLimit - Number(completedThisMonth || 0))
    : trialActive
      ? Math.max(
          0,
          TRIAL_LIMITS.evaluationsTotal - Number(completedAllTime || 0),
        )
      : 0;
  const gifted = Math.max(0, Number(entitlements?.gifted_evaluations || 0));
  const seatLimit =
    Number(entitlements?.seats_limit || 0) || PLAN_LIMITS[planKey].seats;
  const activeUsers = members.filter((member) => member.status === "active").length;

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <AppTopNav
        active="admin"
        userEmail={access.userEmail}
        userRole="company_admin"
      />

      <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-5 lg:px-7">
        <div className="mb-6">
          <Link
            href="/admin/customers"
            className="text-xs font-black text-slate-500 hover:text-slate-950"
          >
            ← Customers & Billing
          </Link>
          <div className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            Platform Administration / Customer
          </div>
          <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-[30px] font-black tracking-[-0.035em]">
                {company.name}
              </h1>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {company.slug} · Created {formatDate(company.created_at)}
              </p>
            </div>
            <span className="w-fit rounded-full bg-white px-3 py-1.5 text-xs font-black uppercase text-slate-600 shadow-sm">
              {readableStatus(billingStatus)}
            </span>
          </div>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ["Plan", planKey === "dealer_pro" ? "Dealer Pro" : planKey === "dealer" ? "Dealer" : "Starter"],
            ["Evaluations left", includedRemaining + gifted],
            ["Included left", includedRemaining],
            ["Gifted left", gifted],
            ["Users", `${activeUsers} / ${seatLimit}`],
            ["Evaluations this month", Number(completedThisMonth || 0)],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                {label}
              </div>
              <div className="mt-2 text-xl font-black text-slate-950">
                {value}
              </div>
            </div>
          ))}
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
              <h2 className="text-lg font-black">Users</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Every user attached to this dealership workspace.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-5 py-3">Email</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Added</th>
                    <th className="px-5 py-3">Last sign in</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.map((member) => (
                    <tr key={member.id}>
                      <td className="px-5 py-4 font-black">{member.email}</td>
                      <td className="px-5 py-4 font-semibold text-slate-600">
                        {member.role === "company_admin"
                          ? "Company Admin"
                          : "User"}
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-600">
                        {member.status}
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-600">
                        {formatDate(member.addedAt)}
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-600">
                        {formatDate(member.lastSignInAt, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black">Billing & usage</h2>
            <div className="mt-4 space-y-3">
              {[
                ["Billing status", readableStatus(billingStatus)],
                ["Trial ends", formatDate(trialEndsAt)],
                ["Current period ends", formatDate(billing?.current_period_end)],
                ["Completed all time", Number(completedAllTime || 0)],
                ["Market searches this month", Number(marketSearchesThisMonth || 0)],
                ["Provider calls this month", Number(providerCallsThisMonth || 0)],
                ["Stripe customer", billing?.stripe_customer_id || "—"],
                ["Stripe subscription", billing?.stripe_subscription_id || "—"],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                >
                  <div className="text-xs font-bold text-slate-500">{label}</div>
                  <div className="max-w-[60%] break-all text-right text-xs font-black text-slate-900">
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <h2 className="text-lg font-black">Gifted credit history</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Recent grants and gifted-evaluation consumption for this customer.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Change</th>
                  <th className="px-5 py-3">Reason</th>
                  <th className="px-5 py-3">Note / evaluation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(creditLedger || []).map((entry) => (
                  <tr key={String(entry.id)}>
                    <td className="px-5 py-4 font-semibold text-slate-600">
                      {formatDate(String(entry.created_at), true)}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-black ${
                          Number(entry.delta || 0) > 0
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {Number(entry.delta || 0) > 0 ? "+" : ""}
                        {Number(entry.delta || 0)}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-black text-slate-900">
                      {String(entry.reason || "").replaceAll("_", " ")}
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-500">
                      {entry.note || entry.subject_key || "—"}
                    </td>
                  </tr>
                ))}
                {(creditLedger || []).length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-5 py-10 text-center font-semibold text-slate-400"
                    >
                      No gifted credit activity yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
