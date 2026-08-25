import Link from "next/link";
import { notFound } from "next/navigation";

import { AppTopNav } from "@/components/navigation/app-top-nav";
import { CompanyUserActions } from "@/components/settings/company-user-actions";
import { CompanyUserInviteForm } from "@/components/settings/company-user-invite-form";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CompanyMemberRow = {
  id: string;
  user_id: string;
  role: string | null;
  status: string | null;
  created_at: string | null;
};

type CompanyMemberView = CompanyMemberRow & {
  email: string;
  displayName: string;
  lastSignInAt: string | null;
};

function formatDate(value: string | null) {
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

function roleTone(role: string | null) {
  return role === "company_admin"
    ? "bg-blue-50 text-blue-700"
    : "bg-emerald-50 text-emerald-700";
}

function statusTone(status: string | null) {
  return status === "disabled"
    ? "bg-slate-100 text-slate-500"
    : "bg-emerald-50 text-emerald-700";
}

export default async function AdminTeamPage() {
  const access = await getMindfulInventoryAccess();
  if (!access || access.company.role !== "company_admin") notFound();

  const admin = createSupabaseAdminClient();
  const { data: memberships, error } = await admin
    .from("company_memberships")
    .select("id,user_id,role,status,created_at")
    .eq("company_id", access.company.companyId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const members: CompanyMemberView[] = await Promise.all(
    ((memberships || []) as CompanyMemberRow[]).map(async (membership) => {
      const { data } = await admin.auth.admin.getUserById(membership.user_id);
      const user = data?.user;
      const metadata = user?.user_metadata || {};
      const displayName =
        typeof metadata.full_name === "string" && metadata.full_name.trim()
          ? metadata.full_name.trim()
          : typeof metadata.name === "string" && metadata.name.trim()
            ? metadata.name.trim()
            : user?.email?.split("@")[0] || "Unknown user";

      return {
        ...membership,
        email: user?.email || "Unknown user",
        displayName,
        lastSignInAt: user?.last_sign_in_at || null,
      };
    }),
  );

  const activeMembers = members.filter((member) => member.status !== "disabled");
  const admins = activeMembers.filter((member) => member.role === "company_admin");

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <AppTopNav active="admin" userEmail={access.userEmail} userRole={access.company.role} />

      <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-5 lg:px-7">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/admin" className="text-xs font-black text-slate-500 hover:text-slate-950">← Administration</Link>
            <div className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Administration / Team & Access</div>
            <h1 className="mt-1 text-[30px] font-black tracking-[-0.035em]">Internal Team & Access</h1>
            <p className="mt-2 max-w-3xl text-slate-600">
              Manage the Mindful team members who can enter Lot Logic. Internal users are separate from external Partners and may also be assigned work directly.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
              <div className="text-[9px] font-black uppercase text-slate-400">Active</div>
              <div className="mt-1 text-lg font-black">{activeMembers.length}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
              <div className="text-[9px] font-black uppercase text-slate-400">Admins</div>
              <div className="mt-1 text-lg font-black">{admins.length}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
              <div className="text-[9px] font-black uppercase text-slate-400">Disabled</div>
              <div className="mt-1 text-lg font-black">{members.length - activeMembers.length}</div>
            </div>
          </div>
        </div>

        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-black">Add Internal Team Member</h2>
            <p className="mt-1 text-sm text-slate-600">
              This invitation is for Mindful staff who need Lot Logic access. External service Partners remain managed under Partners and will receive their own limited portal invitation flow later.
            </p>
          </div>
          <CompanyUserInviteForm canManageUsers />
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black">Team Directory</h2>
              <p className="mt-0.5 text-sm text-slate-500">Role controls administrative access. Disabled users retain history but cannot enter the company workspace.</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-600">{members.length} total</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-white text-[10px] font-black uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-3">Team Member</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Added</th>
                  <th className="px-5 py-3">Last Sign In</th>
                  <th className="px-5 py-3">Access Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((member) => (
                  <tr key={member.id} className="align-top hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <div className="font-black text-slate-950">{member.displayName}</div>
                      <div className="mt-0.5 text-xs font-semibold text-slate-500">{member.email}</div>
                      {member.user_id === access.userId ? <span className="mt-1.5 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-600">You</span> : null}
                    </td>
                    <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${roleTone(member.role)}`}>{roleLabel(member.role)}</span></td>
                    <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${statusTone(member.status)}`}>{member.status || "active"}</span></td>
                    <td className="px-5 py-4 font-semibold text-slate-600">{formatDate(member.created_at)}</td>
                    <td className="px-5 py-4 font-semibold text-slate-600">{formatDate(member.lastSignInAt)}</td>
                    <td className="px-5 py-4">
                      <CompanyUserActions
                        membershipId={member.id}
                        currentRole={member.role || "user"}
                        currentStatus={member.status || "active"}
                        canManageUsers
                        isCurrentUser={member.user_id === access.userId}
                      />
                    </td>
                  </tr>
                ))}
                {members.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-10 text-center font-semibold text-slate-400">No internal team members found.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Role Model</div>
            <h3 className="mt-1 text-base font-black">Company Admin</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">Can enter Administration, manage internal users, partners, locations/resources, and shared operating configuration.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Role Model</div>
            <h3 className="mt-1 text-base font-black">User</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">Can use Lot Logic and Inventory Operations but does not receive the Administration entry point or administrative routes.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
