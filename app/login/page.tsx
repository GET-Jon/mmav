"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LotLogicLogo } from "@/components/branding/lot-logic-logo";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [status, setStatus] = useState(
    searchParams.get("authError") === "confirmation"
      ? "We couldn’t finish signing you in from that email link. Sign in with your password to continue, or request a fresh magic link."
      : "",
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setStatus("");

    const supabase = createSupabaseBrowserClient();

    try {
      if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });

        if (error) {
          throw error;
        }

        setStatus("Check your email for a login link.");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      router.push(next);
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/" aria-label="Lot Logic home" className="shrink-0 transition-opacity hover:opacity-75">
            <LotLogicLogo />
          </Link>
          <Link href="/" className="text-sm font-bold text-slate-600 hover:text-blue-700">
            Back to home
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <h1 className="text-2xl font-black tracking-tight">Welcome back</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Sign in to your Lot Logic workspace.
            </p>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setMode("password");
                setStatus("");
              }}
              aria-pressed={mode === "password"}
              className={`rounded-lg px-3 py-2 text-sm font-bold ${
                mode === "password"
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              Password
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("magic");
                setStatus("");
              }}
              aria-pressed={mode === "magic"}
              className={`rounded-lg px-3 py-2 text-sm font-bold ${
                mode === "magic"
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              Magic Link
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                Email
              </div>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"
              />
            </label>

            {mode === "password" ? (
              <label className="block">
                <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Password
                </div>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"
                />
              </label>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:bg-slate-300"
            >
              {loading
                ? "Signing in..."
                : mode === "magic"
                ? "Send Magic Link"
                : "Sign In"}
            </button>

            {status ? (
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                {status}
              </div>
            ) : null}
          </form>

          <p className="mt-5 text-center text-sm font-semibold text-slate-500">
            New to Lot Logic?{" "}
            <Link href="/signup" className="font-bold text-blue-700 hover:underline">Create an account</Link>
          </p>

          <p className="mt-5 text-center text-xs font-semibold leading-5 text-slate-500">
            By continuing, you agree to the{" "}
            <Link href="/terms" className="font-black text-blue-700 hover:underline">Terms of Use</Link>
            {" "}and acknowledge the{" "}
            <Link href="/privacy" className="font-black text-blue-700 hover:underline">Privacy Policy</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
