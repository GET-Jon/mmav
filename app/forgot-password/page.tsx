"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [working, setWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setErrorMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + "/auth/confirm?next=%2Fset-password",
      });
      if (error) throw error;
      // Do not reveal whether an account exists for this email.
      setSubmitted(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not request a reset link.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 text-slate-950">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-2xl font-black">Reset your Lot Logic password</div>
        {submitted ? (
          <p className="text-sm leading-6 text-slate-600">
            If an account exists for that address, a password reset link is on its way. Check your inbox and spam folder.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-slate-600">Enter your account email to receive a secure password reset link.</p>
            <label className="block">
              <span className="mb-1 block text-sm font-bold">Email</span>
              <input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
                required className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" />
            </label>
            <button type="submit" disabled={working} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:bg-slate-300">
              {working ? "Sending..." : "Send reset link"}
            </button>
            {errorMessage ? <p role="alert" className="text-sm text-red-700">{errorMessage}</p> : null}
          </form>
        )}
        <p className="mt-6 text-sm"><Link href="/login" className="font-bold text-blue-700 hover:underline">Back to sign in</Link></p>
      </section>
    </main>
  );
}
