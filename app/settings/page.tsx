import Link from "next/link";
import { redirect } from "next/navigation";

import { AssumptionsTabs } from "@/components/assumptions/assumptions-tabs";
import { AppTopNav } from "@/components/navigation/app-top-nav";
import { AccountSettingsCard } from "@/components/settings/account-settings-card";
import { BillingSettingsCard } from "@/components/settings/billing-settings-card";
import { CompanyUserActions } from "@/components/settings/company-user-actions";
import { CompanyUserInviteForm } from "@/components/settings/company-user-invite-form";
import { OrganizationProfileEditor } from "@/components/settings/organization-profile-editor";
import { LotLogicEvidenceCard } from "@/components/settings/lot-logic-evidence-card";
import { LotLogicIntelligenceCard } from "@/components/settings/lot-logic-intelligence-card";
import { MarketCheckApiSettingsCard } from "@/components/settings/marketcheck-api-settings-card";
import { defaultAssumptions, normalizeAssumptions } from "@/lib/assumptions";
import { listIntelligenceSettingsData } from "@/lib/lot-logic-intelligence/service";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import { getCurrentUser } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

type SettingsTab =
  | "account"
  | "evaluator"
  | "api"
  | "organization"
  | "billing"
  | "intelligence";

type SettingsPageProps = {
  searchParams?: Promise<{
    tab?: string | string[];
  }>;
};


type CompanyMemberView = {
  id: string;
  user_id: string;
  role: string | null;
  status: string | null;
  created_at: string | null;
  email: string;
  displayName: string;
  lastSignInAt: string | null;
};

function formatMemberDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function roleLabel(role: string | null) {
  return role === "company_admin" ? "Company Admin" : "User";
}

function normalizeTab(value: string | string[] | undefined): SettingsTab {
  const raw = Array.isArray(value) ? value[0] : value;
  if (
    raw === "account" ||
    raw === "evaluator" ||
    raw === "api" ||
    raw === "organization" ||
    raw === "billing" ||
    raw === "intelligence"
  ) {
    return raw;
  }
  return "account";
}

function tabClass(isActive: boolean) {
  return [
    "rounded-full px-4 py-2 text-sm font-bold shadow-sm transition",
    isActive
      ? "bg-slate-950 text-white"
      : "bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800",
  ].join(" ");
}

async function loadSettingsContext(userId: string) {
  const supabase = createSupabaseAdminClient();
  const company = await getCurrentCompanyForUser(supabase, userId);

  const [membershipsResult, intelligence, assumptionsResult] = await Promise.all([
    supabase
      .from("company_memberships")
      .select("id,user_id,role,status,created_at")
      .eq("company_id", company.companyId)
      .order("created_at", { ascending: true }),
    listIntelligenceSettingsData(supabase, company.companyId),
    supabase
      .from("app_settings")
      .select("payload")
      .eq("key", "underwriting_assumptions")
      .maybeSingle(),
  ]);

  if (membershipsResult.error) throw new Error(membershipsResult.error.message);
  if (assumptionsResult.error) throw new Error(assumptionsResult.error.message);

  const members: CompanyMemberView[] = await Promise.all(
    (membershipsResult.data || []).map(async (membership) => {
      const { data } = await supabase.auth.admin.getUserById(membership.user_id);
      const memberUser = data?.user;
      const metadata = memberUser?.user_metadata || {};
      const displayName =
        typeof metadata.full_name === "string" && metadata.full_name.trim()
          ? metadata.full_name.trim()
          : typeof metadata.name === "string" && metadata.name.trim()
            ? metadata.name.trim()
            : memberUser?.email?.split("@")[0] || "Unknown user";

      return {
        ...membership,
        email: memberUser?.email || "Unknown user",
        displayName,
        lastSignInAt: memberUser?.last_sign_in_at || null,
      };
    }),
  );

  return {
    company,
    members,
    memberCount: members.filter((member) => member.status !== "disabled").length,
    intelligence,
    assumptions: assumptionsResult.data?.payload
      ? normalizeAssumptions(assumptionsResult.data.payload)
      : defaultAssumptions,
  };
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const activeTab = normalizeTab(resolvedSearchParams.tab);
  const user = await getCurrentUser();

  if (!user) redirect("/login?next=/settings");

  let companyContext: Awaited<ReturnType<typeof loadSettingsContext>> | null = null;
  let loadError: string | null = null;

  try {
    companyContext = await loadSettingsContext(user.id);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Settings data failed to load.";
  }

  const company = companyContext?.company;

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <AppTopNav active="settings" userEmail={user.email} userRole={company?.role} />

      <div className="mx-auto w-full max-w-[1380px] px-4 py-5 sm:px-5 lg:px-7">
        <div className="mb-6">
          <h1 className="text-[28px] font-black tracking-[-0.035em] text-slate-950">Settings</h1>
          <p className="mt-1 text-slate-600">
            Manage your account, evaluator behavior, organization, integrations,
            and Lot Logic Intelligence.
          </p>
        </div>

        {loadError ? (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            Settings could not load: {loadError}
          </div>
        ) : null}

        <div className="mb-5 flex flex-wrap gap-2">
          <Link href="/settings?tab=account" className={tabClass(activeTab === "account")}>Account</Link>
          <Link href="/settings?tab=evaluator" className={tabClass(activeTab === "evaluator")}>Evaluator Settings</Link>
          <Link href="/settings?tab=api" className={tabClass(activeTab === "api")}>API Usage</Link>
          <Link href="/settings?tab=organization" className={tabClass(activeTab === "organization")}>Organization & Team</Link>
          <Link href="/settings?tab=billing" className={tabClass(activeTab === "billing")}>Billing</Link>
          <Link href="/settings?tab=intelligence" className={tabClass(activeTab === "intelligence")}>Lot Logic Intelligence</Link>
        </div>

        {activeTab === "account" ? (
          <AccountSettingsCard
            initialName={
              typeof user.user_metadata?.full_name === "string"
                ? user.user_metadata.full_name
                : typeof user.user_metadata?.name === "string"
                  ? user.user_metadata.name
                  : ""
            }
            initialEmail={user.email || ""}
            companyName={company?.companyName || ""}
            role={company?.role || ""}
          />
        ) : null}

        {activeTab === "evaluator" && companyContext ? (
          <section>
            <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">
                Evaluator Settings
              </div>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                How Lot Logic underwrites a deal
              </h2>
              <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-600">
                These are the small number of business and market assumptions
                that still directly affect the evaluator. Dealership
                preferences, customer sweet spots, and buying philosophy belong
                in Insights → Teach Lot Logic.
              </p>
            </div>
            <AssumptionsTabs assumptions={companyContext.assumptions} />
          </section>
        ) : null}

        {activeTab === "api" ? <MarketCheckApiSettingsCard /> : null}

        {activeTab === "organization" && companyContext ? (
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">
                    Organization & Team
                  </div>
                  <h2 className="mt-1 text-xl font-black text-slate-950">
                    Manage your Lot Logic workspace
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                    Keep your company details current and control who can access this workspace.
                  </p>
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">
                  {companyContext.memberCount} active member{companyContext.memberCount === 1 ? "" : "s"}
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                <OrganizationProfileEditor
                  initialName={company.companyName}
                  canEdit={company.role === "company_admin"}
                />
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Your access
                  </div>
                  <div className="mt-2 text-lg font-black text-slate-950">
                    {roleLabel(company.role)}
                  </div>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                    Company Admins can manage billing, evaluator configuration, and team access for this workspace.
                  </p>
                </div>
              </div>
            </section>

            {company.role === "company_admin" ? (
              <CompanyUserInviteForm canManageUsers />
            ) : null}

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                <h3 className="text-lg font-black text-slate-950">Team members</h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Company Admins can invite users, change roles, or disable access.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead className="bg-white text-[10px] font-black uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-5 py-3">Member</th>
                      <th className="px-5 py-3">Role</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Added</th>
                      <th className="px-5 py-3">Last sign in</th>
                      <th className="px-5 py-3">Access</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {companyContext.members.map((member) => (
                      <tr key={member.id} className="align-top hover:bg-slate-50/70">
                        <td className="px-5 py-4">
                          <div className="font-black text-slate-950">{member.displayName}</div>
                          <div className="mt-0.5 text-xs font-semibold text-slate-500">{member.email}</div>
                          {member.user_id === user.id ? (
                            <span className="mt-1.5 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-600">You</span>
                          ) : null}
                        </td>
                        <td className="px-5 py-4">
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase text-blue-700">
                            {roleLabel(member.role)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                            member.status === "disabled"
                              ? "bg-slate-100 text-slate-500"
                              : "bg-emerald-50 text-emerald-700"
                          }`}>
                            {member.status || "active"}
                          </span>
                        </td>
                        <td className="px-5 py-4 font-semibold text-slate-600">{formatMemberDate(member.created_at)}</td>
                        <td className="px-5 py-4 font-semibold text-slate-600">{formatMemberDate(member.lastSignInAt)}</td>
                        <td className="px-5 py-4">
                          <CompanyUserActions
                            membershipId={member.id}
                            currentRole={member.role || "user"}
                            currentStatus={member.status || "active"}
                            canManageUsers={company.role === "company_admin"}
                            isCurrentUser={member.user_id === user.id}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : null}

        {activeTab === "billing" ? <BillingSettingsCard /> : null}

        {activeTab === "intelligence" && companyContext ? (
          <>
            <LotLogicIntelligenceCard
              canReview={companyContext.company.role === "company_admin"}
              initialKnowledgeSources={companyContext.intelligence.knowledgeSources}
              initialInsights={companyContext.intelligence.insights}
              initialAssertions={companyContext.intelligence.assertions}
            />
            <LotLogicEvidenceCard />
          </>
        ) : null}
      </div>
    </main>
  );
}
