"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type ProvisionResponse = {
  company?: { id: string; name: string };
  error?: string;
  code?: string;
};

export function OnboardingCheckout() {
  const started = useRef(false);
  const [status, setStatus] = useState("Creating your Lot Logic workspace…");
  const [error, setError] = useState("");
  const [needsProfile, setNeedsProfile] = useState(false);
  const [zip, setZip] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  async function finishProfile() {
    setSavingProfile(true);
    setError("");
    try {
      const response = await fetch("/api/onboarding/provision", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip, websiteUrl }),
      });
      const data = await response.json() as ProvisionResponse;
      if (!response.ok) throw new Error(data.error || "Workspace setup failed.");
      window.location.replace("/evaluate?trial=started");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Workspace setup failed.");
      setSavingProfile(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function run() {
      try {
        const provisionResponse = await fetch("/api/onboarding/provision", {
          method: "POST",
        });
        const provision = (await provisionResponse.json()) as ProvisionResponse;

        if (provision.code === "DEALERSHIP_PROFILE_REQUIRED") {
          setNeedsProfile(true);
          return;
        }
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

        {needsProfile ? (
          <form className="mt-5 space-y-4 text-left" onSubmit={(event) => { event.preventDefault(); void finishProfile(); }}>
            <p className="text-sm leading-6 text-slate-500">Set your dealership’s starting market before your first comp search.</p>
            <label className="block text-sm font-bold">Dealership ZIP code
              <input required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} value={zip} onChange={(event) => setZip(event.target.value.replace(/\D/g, ""))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" />
            </label>
            <label className="block text-sm font-bold">Website (optional)
              <input inputMode="url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://yourdealership.com" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" />
            </label>
            {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
            <button disabled={savingProfile} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50">{savingProfile ? "Saving…" : "Start my free trial"}</button>
          </form>
        ) : !error ? (
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
