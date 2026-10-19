"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type DealershipProfile = {
  zip: string;
  websiteUrl: string;
};

type ProvisionResponse = {
  company?: { id: string; name: string };
  profile?: DealershipProfile;
  error?: string;
  code?: string;
};

type OnboardingStep = "loading" | "zip" | "website";

export function OnboardingCheckout() {
  const started = useRef(false);
  const [step, setStep] = useState<OnboardingStep>("loading");
  const [status, setStatus] = useState("Creating your Lot Logic workspace…");
  const [error, setError] = useState("");
  const [zip, setZip] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  function continueToEvaluator() {
    window.location.replace("/evaluate?trial=started");
  }

  function applyProfile(profile?: DealershipProfile) {
    if (!profile) return;
    setZip(profile.zip || "");
    setWebsiteUrl(profile.websiteUrl || "");
  }

  async function saveRequiredZip() {
    setSavingProfile(true);
    setError("");

    try {
      const response = await fetch("/api/onboarding/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip }),
      });
      const data = (await response.json()) as ProvisionResponse;

      if (!response.ok) {
        throw new Error(data.error || "Workspace setup failed.");
      }

      applyProfile(data.profile);

      if (data.profile?.websiteUrl) {
        continueToEvaluator();
        return;
      }

      setStep("website");
      setSavingProfile(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Workspace setup failed.");
      setSavingProfile(false);
    }
  }

  async function saveWebsite() {
    setSavingProfile(true);
    setError("");

    try {
      const response = await fetch("/api/onboarding/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip, websiteUrl }),
      });
      const data = (await response.json()) as ProvisionResponse;

      if (!response.ok) {
        throw new Error(data.error || "Workspace setup failed.");
      }

      continueToEvaluator();
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
          setStep("zip");
          return;
        }

        if (!provisionResponse.ok) {
          throw new Error(provision.error || "Workspace setup failed.");
        }

        applyProfile(provision.profile);

        if (!provision.profile?.websiteUrl) {
          setStep("website");
          return;
        }

        setStatus("Workspace ready. Your 5 free evaluations are active — no credit card required.");
        window.setTimeout(() => {
          continueToEvaluator();
        }, 700);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Onboarding failed.");
      }
    }

    void run();
  }, []);

  const isWebsiteStep = step === "website";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 text-slate-950">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-xl font-black text-blue-700">
          LL
        </div>

        {step === "zip" ? (
          <>
            <h1 className="mt-5 text-2xl font-black">One last detail</h1>
            <form
              className="mt-5 space-y-4 text-left"
              onSubmit={(event) => {
                event.preventDefault();
                void saveRequiredZip();
              }}
            >
              <p className="text-sm leading-6 text-slate-500">
                Set your dealership&apos;s starting market so Lot Logic can begin every comp search in the right place.
              </p>
              <label className="block text-sm font-bold">
                Dealership ZIP code
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]{5}"
                  maxLength={5}
                  value={zip}
                  onChange={(event) => setZip(event.target.value.replace(/\D/g, ""))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-blue-500"
                />
              </label>
              {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
              <button
                disabled={savingProfile}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50"
              >
                {savingProfile ? "Saving…" : "Continue"}
              </button>
            </form>
          </>
        ) : isWebsiteStep ? (
          <>
            <h1 className="mt-5 text-2xl font-black">Make Lot Logic yours</h1>
            <div className="mt-4 space-y-3 text-left text-sm leading-6 text-slate-600">
              <p>
                The more Lot Logic understands your dealership, the better its recommendations become.
              </p>
              <p>
                Share your dealership website and we&apos;ll learn about the vehicles you sell, how you position your inventory, and where your dealership tends to focus.
              </p>
              <p>
                We&apos;ll combine that understanding with how you use Lot Logic over time to tailor evaluations specifically to your business.
              </p>
            </div>

            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-left text-sm font-bold leading-6 text-blue-950">
              This isn&apos;t generic vehicle data. It&apos;s your dealership&apos;s acquisition intelligence.
            </div>

            <form
              className="mt-5 space-y-4 text-left"
              onSubmit={(event) => {
                event.preventDefault();
                void saveWebsite();
              }}
            >
              <label className="block text-sm font-bold">
                Dealership website
                <input
                  required
                  inputMode="url"
                  value={websiteUrl}
                  onChange={(event) => setWebsiteUrl(event.target.value)}
                  placeholder="https://yourdealership.com"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-blue-500"
                />
                <span className="mt-1 block text-xs font-medium leading-5 text-slate-400">
                  Optional. You can add or change this anytime in Settings.
                </span>
              </label>

              {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}

              <button
                disabled={savingProfile}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50"
              >
                {savingProfile ? "Personalizing…" : "Personalize Lot Logic"}
              </button>

              <button
                type="button"
                disabled={savingProfile}
                onClick={continueToEvaluator}
                className="w-full rounded-xl px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-900 disabled:opacity-50"
              >
                Skip for now
              </button>
            </form>

            <p className="mt-5 text-xs font-semibold text-slate-400">
              Welcome to the future of buying inventory.
            </p>
          </>
        ) : !error ? (
          <>
            <h1 className="mt-5 text-2xl font-black">Starting your free Lot Logic trial</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{status}</p>
            <div className="mx-auto mt-6 h-1.5 w-40 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-blue-600" />
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-5 text-2xl font-black">We hit a setup issue</h1>
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
