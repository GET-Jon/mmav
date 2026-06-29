"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("magic");
  const [status, setStatus] = useState("");
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
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 text-slate-950">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <div className="text-2xl font-black">MMAV Login</div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Sign in to access the auction evaluator and saved deal pipeline.
          </p>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode("magic")}
            className={`rounded-lg px-3 py-2 text-sm font-bold ${
              mode === "magic"
                ? "bg-white text-slate-950 shadow-sm"
                : "text-slate-500"
            }`}
          >
            Magic Link
          </button>

          <button
            type="button"
            onClick={() => setMode("password")}
            className={`rounded-lg px-3 py-2 text-sm font-bold ${
              mode === "password"
                ? "bg-white text-slate-950 shadow-sm"
                : "text-slate-500"
            }`}
          >
            Password
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              Email
            </div>
            <input
              type="email"
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
            className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:bg-slate-300"
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
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
