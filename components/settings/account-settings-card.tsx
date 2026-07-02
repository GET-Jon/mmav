"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function AccountSettingsCard({
  initialName = "",
  initialEmail = "",
  companyName = "",
  role = "",
}: {
  initialName?: string | null;
  initialEmail?: string | null;
  companyName?: string | null;
  role?: string | null;
}) {
  const supabase = createSupabaseBrowserClient();

  const [name, setName] = useState(initialName || "");
  const [email, setEmail] = useState(initialEmail || "");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveProfile() {
    setStatus("");
    setError("");
    setSavingProfile(true);

    try {
      const updates: {
        data: {
          full_name: string;
          name: string;
        };
        email?: string;
      } = {
        data: {
          full_name: name.trim(),
          name: name.trim(),
        },
      };

      if (email.trim() && email.trim() !== initialEmail) {
        updates.email = email.trim();
      }

      const { error: updateError } = await supabase.auth.updateUser(updates);

      if (updateError) {
        throw updateError;
      }

      setStatus(
        updates.email
          ? "Profile saved. Check the new email address for a confirmation link if required."
          : "Profile saved."
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not update profile."
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword() {
    setStatus("");
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== passwordConfirm) {
      setError("Password confirmation does not match.");
      return;
    }

    setSavingPassword(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw updateError;
      }

      setPassword("");
      setPasswordConfirm("");
      setStatus("Password updated.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not update password."
      );
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5">
          <h2 className="text-xl font-bold">Account</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Manage your basic profile and sign-in credentials.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
              Name
            </div>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:border-blue-300"
              placeholder="Your name"
            />
          </label>

          <label className="block">
            <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
              Email
            </div>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:border-blue-300"
              placeholder="you@example.com"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={saveProfile}
          disabled={savingProfile}
          className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {savingProfile ? "Saving..." : "Save Profile"}
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5">
          <h2 className="text-xl font-bold">Password</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Set a new password for this account.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
              New Password
            </div>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:border-blue-300"
              placeholder="At least 8 characters"
            />
          </label>

          <label className="block">
            <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
              Confirm Password
            </div>
            <input
              type="password"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:border-blue-300"
              placeholder="Re-enter new password"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={savePassword}
          disabled={savingPassword}
          className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {savingPassword ? "Updating..." : "Update Password"}
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-xl font-bold">Company Access</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Your current organization context.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">
              Company
            </div>
            <div className="mt-1 text-sm font-bold text-slate-900">
              {companyName || "—"}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">
              Role
            </div>
            <div className="mt-1 text-sm font-bold text-slate-900">
              {role || "—"}
            </div>
          </div>
        </div>
      </section>

      {status ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          {status}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
          {error}
        </div>
      ) : null}
    </div>
  );
}
