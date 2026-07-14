import Link from "next/link";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { CompanyUserInviteForm } from "@/components/settings/company-user-invite-form";
import { MarketCheckApiSettingsCard } from "@/components/settings/marketcheck-api-settings-card";
import { AccountSettingsCard } from "@/components/settings/account-settings-card";
import { CompanyUserActions } from "@/components/settings/company-user-actions";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import { getCurrentUser } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

type SettingsTab = "account" | "api" | "users" | "organization";

type SettingsPageProps = {
  searchParams?: Promise<{
    tab?: string | string[];
  }>;
};

type CompanyMemberRow = {
  id: string;
  user_id: string;
  role: string | null;
  status: string | null;
  created_at: string | null;
};

type CompanyMemberView = CompanyMemberRow & {
  email: string;
  lastSignInAt: string | null;
};

function normalizeTab(value: string | string[] | undefined): SettingsTab {
  const raw = Array.isArray(value) ? value[0] : value;

  if (
    raw === "account" ||
    raw === "api" ||
    raw === "users" ||
    raw === "organization"
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

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function roleTone(role: string | null) {
  switch (role) {
    case "company_admin":
      return "bg-blue-50 text-blue-700";
    case "user":
      return "bg-emerald-50 text-emerald-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function formatRole(role: string | null) {
  switch (role) {
    case "company_admin":
      return "Company Admin";
    case "user":
      return "User";
    default:
      return role || "User";
  }
}

async function loadSettingsContext(userId: string) {
  const supabase = createSupabaseAdminClient();
  const company = await getCurrentCompanyForUser(supabase, userId);

  const { data: members, error: membersError } = await supabase
    .from("company_memberships")
    .select("id, user_id, role, status, created_at")
    .eq("company_id", company.companyId)
    .order("created_at", { ascending: true });

  if (membersError) {
    throw new Error(membersError.message);
  }

  const enrichedMembers: CompanyMemberView[] = await Promise.all(
    ((members || []) as CompanyMemberRow[]).map(async (member) => {
      const { data } = await supabase.auth.admin.getUserById(member.user_id);

      return {
        ...member,
        email: data?.user?.email || "Unknown user",
        lastSignInAt: data?.user?.last_sign_in_at || null,
      };
    })
  );

  return {
    company,
    members: enrichedMembers,
  };
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const activeTab = normalizeTab(resolvedSearchParams.tab);

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login?next=/settings");
  }

  let companyContext: Awaited<ReturnType<typeof loadSettingsContext>> | null =
    null;
  let loadError: string | null = null;

  if (user) {
    try {
      companyContext = await loadSettingsContext(user.id);
    } catch (error) {
      loadError =
        error instanceof Error
          ? error.message
          : "Settings data failed to load.";
    }
  }

  const company = companyContext?.company;
  const members = companyContext?.members || [];
  const canManageUsers = company?.role === "company_admin";

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="flex min-h-screen">
        <AppSidebar active="settings" userEmail={user?.email} />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 p-6">
            <div className="mb-6">
              <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
              <p className="mt-1 text-slate-600">
                Review operational rules, company users, and organization
                configuration.
              </p>
            </div>

            {loadError ? (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                Settings could not load: {loadError}
              </div>
            ) : null}

            <div className="mb-5 flex flex-wrap gap-2">
              <Link
                href="/settings?tab=account"
                className={tabClass(activeTab === "account")}
              >
                Account
              </Link>

              <Link
                href="/settings?tab=api"
                className={tabClass(activeTab === "api")}
              >
                API Usage
              </Link>

              <Link
                href="/settings?tab=users"
                className={tabClass(activeTab === "users")}
              >
                Users
              </Link>

              <Link
                href="/settings?tab=organization"
                className={tabClass(activeTab === "organization")}
              >
                Organization
              </Link>
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
                companyName={companyContext?.company.companyName || ""}
                role={companyContext?.company.role || ""}
              />
            ) : null}

            {activeTab === "api" ? (
              <MarketCheckApiSettingsCard />
            ) : null}

            {activeTab === "users" ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div>
                    <h2 className="text-xl font-bold">Company Users</h2>
                    <p className="mt-1 max-w-3xl text-sm text-slate-600">
                      Users attached to {company?.companyName || "this company"}.
                      Add users, adjust roles, and disable access for users who
                      should no longer see this company workspace.
                    </p>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    User invites are now available for company admins. Email
                    delivery/password setup can be refined next.
                  </div>
                </div>

                <div className="mb-5">
                  <CompanyUserInviteForm canManageUsers={canManageUsers} />
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3">User</th>
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Added</th>
                        <th className="px-4 py-3">Last Sign In</th>
                        <th className="px-4 py-3">Actions</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {members.length ? (
                        members.map((member) => (
                          <tr key={member.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <div className="font-bold text-slate-950">
                                {member.email}
                              </div>
                              <div className="mt-1 font-mono text-xs text-slate-400">
                                {member.user_id}
                              </div>
                            </td>

                            <td className="px-4 py-3">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-bold ${roleTone(
                                  member.role
                                )}`}
                              >
                                {formatRole(member.role)}
                              </span>
                            </td>

                            <td className="px-4 py-3">
                              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                                {member.status || "active"}
                              </span>
                            </td>

                            <td className="px-4 py-3 text-slate-600">
                              {formatDate(member.created_at)}
                            </td>

                            <td className="px-4 py-3 text-slate-600">
                              {formatDate(member.lastSignInAt)}
                            </td>

                            <td className="px-4 py-3">
                              <CompanyUserActions
                                membershipId={member.id}
                                currentRole={member.role || "user"}
                                currentStatus={member.status || "active"}
                                canManageUsers={canManageUsers}
                                isCurrentUser={member.user_id === user?.id}
                              />
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-8 text-center text-sm font-semibold text-slate-500"
                          >
                            No company users found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {activeTab === "organization" ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5">
                  <h2 className="text-xl font-bold">Organization</h2>
                  <p className="mt-1 max-w-3xl text-sm text-slate-600">
                    Current company context resolved from the logged-in user's
                    active company membership.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Company
                    </div>
                    <div className="mt-2 text-lg font-black">
                      {company?.companyName || "—"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Slug
                    </div>
                    <div className="mt-2 font-mono text-sm font-bold">
                      {company?.companySlug || "—"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Your Role
                    </div>
                    <div className="mt-2 text-lg font-black">
                      {company?.role || "—"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Members
                    </div>
                    <div className="mt-2 text-lg font-black">
                      {members.length}
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  Editing company name, slug, API limits, and user roles should
                  be added after invite/user-management actions are wired.
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
