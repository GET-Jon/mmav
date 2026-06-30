"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CompanyUserActionsProps = {
  membershipId: string;
  currentRole: string;
  currentStatus: string;
  canManageUsers: boolean;
  isCurrentUser: boolean;
};

export function CompanyUserActions({
  membershipId,
  currentRole,
  currentStatus,
  canManageUsers,
  isCurrentUser,
}: CompanyUserActionsProps) {
  const router = useRouter();

  const [role, setRole] = useState(currentRole || "user");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const isDisabled = currentStatus === "disabled";

  async function updateUser(next: { role?: string; status?: string }) {
    if (!canManageUsers) {
      setStatus("Only company admins can manage users.");
      return;
    }

    setSaving(true);
    setStatus("");

    try {
      const response = await fetch("/api/company/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          membershipId,
          ...next,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update user.");
      }

      setStatus("Updated.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to update user.");
      setRole(currentRole || "user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={role}
          disabled={!canManageUsers || saving || isCurrentUser}
          onChange={(event) => {
            const nextRole = event.target.value;
            setRole(nextRole);
            updateUser({ role: nextRole });
          }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow-sm outline-none disabled:bg-slate-100 disabled:text-slate-400"
        >
          <option value="user">User</option>
          <option value="company_admin">Company Admin</option>
        </select>

        <button
          type="button"
          disabled={!canManageUsers || saving || isCurrentUser}
          onClick={() =>
            updateUser({
              status: isDisabled ? "active" : "disabled",
            })
          }
          className={`rounded-xl px-3 py-2 text-xs font-bold shadow-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${
            isDisabled
              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : "bg-red-50 text-red-700 hover:bg-red-100"
          }`}
        >
          {isDisabled ? "Reactivate" : "Disable"}
        </button>
      </div>

      {isCurrentUser ? (
        <div className="text-xs font-semibold text-slate-400">
          You cannot edit your own access here.
        </div>
      ) : null}

      {status ? (
        <div className="text-xs font-semibold text-slate-500">{status}</div>
      ) : null}
    </div>
  );
}
