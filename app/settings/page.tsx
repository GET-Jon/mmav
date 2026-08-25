import Link from "next/link";
import { redirect } from "next/navigation";

import { AppTopNav } from "@/components/navigation/app-top-nav";
import { AccountSettingsCard } from "@/components/settings/account-settings-card";
import { MarketCheckApiSettingsCard } from "@/components/settings/marketcheck-api-settings-card";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import { getCurrentUser } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

type SettingsTab = "account" | "api" | "organization";

type SettingsPageProps = {
  searchParams?: Promise<{
    tab?: string | string[];
  }>;
};

function normalizeTab(value: string | string[] | undefined): SettingsTab {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "account" || raw === "api" || raw === "organization") return raw;
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

  const { count, error } = await supabase
    .from("company_memberships")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.companyId);

  if (error) throw new Error(error.message);

  return {
    company,
    memberCount: count || 0,
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
          <p className="mt-1 text-slate-600">Manage your account, API usage, and organization information.</p>
        </div>

        {loadError ? (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            Settings could not load: {loadError}
          </div>
        ) : null}

        <div className="mb-5 flex flex-wrap gap-2">
          <Link href="/settings?tab=account" className={tabClass(activeTab === "account")}>Account</Link>
          <Link href="/settings?tab=api" className={tabClass(activeTab === "api")}>API Usage</Link>
          <Link href="/settings?tab=organization" className={tabClass(activeTab === "organization")}>Organization</Link>
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

        {activeTab === "api" ? <MarketCheckApiSettingsCard /> : null}

        {activeTab === "organization" ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5">
              <h2 className="text-xl font-bold">Organization</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">Your current Mindful Motor Co. organization context.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-500">Company</div><div className="mt-2 text-lg font-black">{company?.companyName || "—"}</div></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-500">Slug</div><div className="mt-2 font-mono text-sm font-bold">{company?.companySlug || "—"}</div></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-500">Your Role</div><div className="mt-2 text-lg font-black">{company?.role || "—"}</div></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-500">Members</div><div className="mt-2 text-lg font-black">{companyContext?.memberCount ?? "—"}</div></div>
            </div>
            {company?.role === "company_admin" ? (
              <div className="mt-5 text-sm font-semibold text-slate-500">
                Team roles and access are managed from <Link href="/admin/team" className="font-black text-slate-950 hover:underline">Admin → Team & Access</Link>.
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
