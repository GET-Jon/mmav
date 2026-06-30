"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type CompanyUserInviteFormProps = {
  canManageUsers: boolean;
};

export function CompanyUserInviteForm({
  canManageUsers,
}: CompanyUserInviteFormProps) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageUsers) {
      setStatus("Only company admins can add users.");
      return;
    }

    setSubmitting(true);
    setStatus("");

    try {
      const response = await fetch("/api/company/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          role,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to add user.");
      }

      setEmail("");
      setRole("user");
      setStatus(`Added ${data.user?.email || "user"} to the company.`);
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to add user.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
    >
      <div className="mb-3">
        <div className="text-sm font-black text-slate-950">Add user</div>
        <div className="mt-1 text-xs leading-5 text-slate-500">
          Creates or finds a Supabase Auth user and attaches them to this company.
          They can log in with magic link or a password set later.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_auto] md:items-end">
        <label className="block">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Email
          </div>
          <input
            type="email"
            required
            disabled={!canManageUsers || submitting}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="user@example.com"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none disabled:bg-slate-100"
          />
        </label>

        <label className="block">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Role
          </div>
          <select
            disabled={!canManageUsers || submitting}
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none disabled:bg-slate-100"
          >
            <option value="user">User</option>
            <option value="company_admin">Company Admin</option>
          </select>
        </label>

        <button
          type="submit"
          disabled={!canManageUsers || submitting}
          className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {submitting ? "Adding..." : "Add User"}
        </button>
      </div>

      {!canManageUsers ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          You can view company users, but only company admins can add or edit
          users.
        </div>
      ) : null}

      {status ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
          {status}
        </div>
      ) : null}
    </form>
  );
}
