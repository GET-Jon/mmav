"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [zip, setZip] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  useEffect(() => {
    if (!confirmationSent) return;
    const supabase = createSupabaseBrowserClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        window.location.replace("/onboarding");
      }
    });
    return () => subscription.unsubscribe();
  }, [confirmationSent]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
          data: {
            full_name: name.trim(),
            company_name: companyName.trim(),
            dealership_zip: zip.trim(),
            dealership_website: websiteUrl.trim(),
            signup_source: "public_try_lot_logic",
          },
        },
      });

      if (error) throw error;

      if (data.session) {
        window.location.assign("/onboarding");
        return;
      }

      setConfirmationSent(true);
      setStatus(
        "We sent a confirmation email. Click its link to sign in and start your free trial automatically — no need to log in again.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Account creation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 text-slate-950">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-7">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">
            Try Lot Logic
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.035em]">
            Create your dealership workspace
          </h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            Start with 5 free evaluations — no credit card required.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">Your name</div>
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={confirmationSent}
              autoComplete="name"
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
            />
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">Dealership / company</div>
            <input
              required
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              disabled={confirmationSent}
              autoComplete="organization"
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"
            />
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">Dealership ZIP code</div>
            <input required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} autoComplete="postal-code" value={zip} onChange={(event) => setZip(event.target.value.replace(/\D/g, ""))} disabled={confirmationSent} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500 disabled:bg-slate-50" />
            <p className="mt-1 text-xs text-slate-500">Your starting market for local vehicle comparisons.</p>
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">Dealership website <span className="normal-case font-medium">(optional)</span></div>
            <input inputMode="url" autoComplete="url" placeholder="https://yourdealership.com" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} disabled={confirmationSent} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500 disabled:bg-slate-50" />
            <p className="mt-1 text-xs text-slate-500">Saved for your dealership’s AI profile. You can add it later.</p>
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">Email</div>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={confirmationSent}
              autoComplete="email"
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"
            />
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">Password</div>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={confirmationSent}
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"
            />
            <div className="mt-1 text-[11px] font-semibold text-slate-400">At least 8 characters.</div>
          </label>

          <button
            type="submit"
            disabled={loading || confirmationSent}
            className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
          >
            {confirmationSent
              ? "Check your email to continue"
              : loading
                ? "Creating account…"
                : "Create account"}
          </button>

          {status ? (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-700">
              {status}
            </div>
          ) : null}
        </form>

        <p className="mt-5 text-center text-xs font-semibold leading-5 text-slate-500">
          Already have an account?{" "}
          <Link href="/login?next=/evaluate" className="font-black text-blue-700 hover:underline">
            Sign in
          </Link>
        </p>

        <p className="mt-3 text-center text-[11px] font-semibold leading-5 text-slate-400">
          By creating an account, you agree to the{" "}
          <Link href="/terms" className="font-black text-slate-600 hover:underline">Terms of Use</Link>
          {" "}and acknowledge the{" "}
          <Link href="/privacy" className="font-black text-slate-600 hover:underline">Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}
