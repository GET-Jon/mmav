"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type ProvisionResponse = {
  company?: { id: string; name: string };
  error?: string;
};

export function OnboardingCheckout() {
  const started = useRef(false);
  const [status, setStatus] = useState("Creating your Lot Logic workspace…");
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function run() {
      try {
        const provisionResponse = await fetch("/api/onboarding/provision", {
          method: "POST",
        });
        const provision = (await provisionResponse.json()) as ProvisionResponse;

        if (!provisionResponse.ok) {
          throw new Error(provision.error || "Workspace setup failed.");
        }

        setStatus("Workspace ready. Your 5 free evaluations are active — no credit card required.");
        window.setTimeout(() => {
          window.location.assign("/evaluate?trial=started");
        }, 700);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Onboarding failed.");
      }
    }

    void run();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 text-slate-950">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-xl font-black text-blue-700">
          LL
        </div>
        <h1 className="mt-5 text-2xl font-black">Starting your free Lot Logic trial</h1>

        {!error ? (
          <>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{status}</p>
            <div className="mx-auto mt-6 h-1.5 w-40 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-blue-600" />
            </div>
          </>
        ) : (
          <>
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">
              {error}
            </div>
            <div className="mt-5 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white"
              >
                Try again
              </button>
              <Link
                href="/evaluate"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700"
              >
                Go to evaluator
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
