"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function SetPasswordForm() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setStatus("");

    if (password.length < 8) {
      setStatus("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("Passwords do not match.");
      return;
    }

    setSaving(true);

    try {
      const supabase = createSupabaseBrowserClient();

      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        throw error;
      }

      setStatus("Password set. Redirecting...");

      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 800);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not set password."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 text-slate-950">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <div className="text-2xl font-black">Set Your Password</div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Create a password for your MMAV account. You can still use magic
            link login later if preferred.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              Password
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"
            />
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              Confirm Password
            </div>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:bg-slate-300"
          >
            {saving ? "Saving..." : "Set Password"}
          </button>

          {status ? (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
              {status}
            </div>
          ) : null}
        </form>
      </div>
    </main>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordForm />
    </Suspense>
  );
}
