import Link from "next/link";
import { notFound } from "next/navigation";

import {
  CustomerBillingAdmin,
  type PlatformCustomerBillingRow,
} from "@/components/admin/customer-billing-admin";
import { AppTopNav } from "@/components/navigation/app-top-nav";
import { getPlatformAdminAccess } from "@/lib/admin/platform-admin";
import { PLAN_LIMITS, TRIAL_LIMITS, type PlanKey } from "@/lib/billing/usage";

export const dynamic = "force-dynamic";

function normalizePlanKey(value: unknown): PlanKey {
  const key = String(value || "").trim().toLowerCase();
  if (key === "dealer" || key === "dealer_pro") return key;
  return "starter";
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

export default async function AdminCustomersPage() {
  const access = await getPlatformAdminAccess();
  if (!access) notFound();

  const admin = access.admin;

  const [
    { data: companies, error: companiesError },
    { data: billingRows, error: billingError },
    { data: entitlementRows, error: entitlementError },
    { data: memberships, error: membershipError },
  ] = await Promise.all([
    admin
      .from("companies")
      .select("id,name,slug,status,created_at")
      .neq("slug", "mindful-motor-co")
      .order("created_at", { ascending: false }),
    admin
      .from("company_billing_accounts")
      .select(
        "company_id,status,plan_key,stripe_customer_id,trial_ends_at,current_period_end",
      ),
    admin
      .from("company_entitlements")
      .select(
        "company_id,evaluations_per_month,seats_limit,gifted_evaluations",
      ),
    admin
      .from("company_memberships")
      .select("company_id,user_id,role,status,created_at")
      .eq("status", "active")
      .order("created_at", { ascending: true }),
  ]);

  if (companiesError) throw new Error(companiesError.message);
  if (billingError) throw new Error(billingError.message);
  if (entitlementError) throw new Error(entitlementError.message);
  if (membershipError) throw new Error(membershipError.message);

  const billingByCompany = new Map(
    (billingRows || []).map((row) => [String(row.company_id), row]),
  );
  const entitlementByCompany = new Map(
    (entitlementRows || []).map((row) => [String(row.company_id), row]),
  );
  const firstAdminMembershipByCompany = new Map<string, { user_id: string }>();
  const activeUsersByCompany = new Map<string, number>();

  for (const membership of memberships || []) {
    const companyId = String(membership.company_id);
    activeUsersByCompany.set(
      companyId,
      (activeUsersByCompany.get(companyId) || 0) + 1,
    );

    if (
      membership.role === "company_admin" &&
      !firstAdminMembershipByCompany.has(companyId)
    ) {
      firstAdminMembershipByCompany.set(companyId, {
        user_id: String(membership.user_id),
      });
    }
  }

  const contactEmailByCompany = new Map<string, string | null>();
  await Promise.all(
    Array.from(firstAdminMembershipByCompany.entries()).map(
      async ([companyId, membership]) => {
        const { data } = await admin.auth.admin.getUserById(membership.user_id);
        contactEmailByCompany.set(companyId, data?.user?.email || null);
      },
    ),
  );

  const monthStart = monthStartIso();

  const customers: PlatformCustomerBillingRow[] = await Promise.all(
    (companies || []).map(async (company) => {
      const companyId = String(company.id);
      const billing = billingByCompany.get(companyId);
      const entitlement = entitlementByCompany.get(companyId);
      const billingStatus = String(billing?.status || "not_configured");
      const planKey = normalizePlanKey(billing?.plan_key);
      const paid = isPaidStatus(billingStatus);
      const trialEndsAt = billing?.trial_ends_at
        ? String(billing.trial_ends_at)
        : null;
      const trialActive =
        billingStatus === "trialing" &&
        Boolean(
          trialEndsAt && new Date(trialEndsAt).getTime() > Date.now(),
        );

      const [
        { count: totalCompleted, error: totalUsageError },
        { count: monthlyCompleted, error: monthlyUsageError },
      ] = await Promise.all([
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
          .gte("created_at", monthStart),
      ]);

      if (totalUsageError) throw new Error(totalUsageError.message);
      if (monthlyUsageError) throw new Error(monthlyUsageError.message);

      const planLimit =
        Number(entitlement?.evaluations_per_month || 0) ||
        PLAN_LIMITS[planKey].evaluationsPerMonth;
      const includedLimit = paid
        ? planLimit
        : trialActive
          ? TRIAL_LIMITS.evaluationsTotal
          : TRIAL_LIMITS.evaluationsTotal;
      const rawIncludedUsage = paid
        ? Number(monthlyCompleted || 0)
        : Number(totalCompleted || 0);
      const includedUsed = Math.min(includedLimit, rawIncludedUsage);
      const includedRemaining = paid
        ? Math.max(0, includedLimit - rawIncludedUsage)
        : trialActive
          ? Math.max(0, includedLimit - rawIncludedUsage)
          : 0;
      const giftedRemaining = Math.max(
        0,
        Number(entitlement?.gifted_evaluations || 0),
      );

      return {
        companyId,
        companyName: String(company.name || "Unnamed company"),
        companySlug: String(company.slug || ""),
        contactEmail: contactEmailByCompany.get(companyId) || null,
        companyStatus: String(company.status || "active"),
        billingStatus,
        planKey,
        trialEndsAt,
        currentPeriodEnd: billing?.current_period_end
          ? String(billing.current_period_end)
          : null,
        includedUsed,
        includedLimit,
        includedRemaining,
        monthlyEvaluationsUsed: Number(monthlyCompleted || 0),
        activeUsers: activeUsersByCompany.get(companyId) || 0,
        seatsLimit:
          Number(entitlement?.seats_limit || 0) ||
          PLAN_LIMITS[planKey].seats,
        giftedRemaining,
        totalRemaining: includedRemaining + giftedRemaining,
        stripeCustomerId: billing?.stripe_customer_id
          ? String(billing.stripe_customer_id)
          : null,
      };
    }),
  );

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
            href="/admin"
            className="text-xs font-black text-slate-500 hover:text-slate-950"
          >
            ← Administration
          </Link>
          <div className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            Platform Administration / Customers
          </div>
          <h1 className="mt-1 text-[30px] font-black tracking-[-0.035em]">
            Customer billing & evaluation credits
          </h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Review every external Lot Logic customer, their subscription plan,
            remaining evaluations, and any gifted credits. Gifted evaluations
            sit on top of the customer&apos;s normal trial or monthly allowance
            and persist until used.
          </p>
        </div>

        <CustomerBillingAdmin customers={customers} />
      </div>
    </main>
  );
}
