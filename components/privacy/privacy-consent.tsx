"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type ConsentState = {
  essential: true;
  analytics: boolean;
  advertising: boolean;
  updatedAt: string;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    posthog?: {
      init?: (token: string, options?: Record<string, unknown>) => void;
      capture?: (event: string, properties?: Record<string, unknown>) => void;
      opt_out_capturing?: () => void;
      opt_in_capturing?: () => void;
      reset?: () => void;
      [key: string]: unknown;
    };
    __lotLogicGaLoaded?: boolean;
    __lotLogicPostHogLoaded?: boolean;
  }
}

const STORAGE_KEY = "lotlogic:consent:v1";
const COOKIE_NAME = "ll_consent_v1";

function readConsent(): ConsentState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    if (
      typeof parsed.analytics !== "boolean" ||
      typeof parsed.advertising !== "boolean"
    ) {
      return null;
    }
    return {
      essential: true,
      analytics: parsed.analytics,
      advertising: parsed.advertising,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function persistConsent(next: ConsentState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  const cookieValue = [
    "essential=1",
    `analytics=${next.analytics ? "1" : "0"}`,
    `advertising=${next.advertising ? "1" : "0"}`,
  ].join("&");
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(cookieValue)}; Max-Age=31536000; Path=/; SameSite=Lax; Secure`;
}

function loadGoogleAnalytics(consent: ConsentState) {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (!measurementId || window.__lotLogicGaLoaded) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = (...args: unknown[]) => {
    window.dataLayer?.push(args);
  };

  window.gtag("consent", "default", {
    analytics_storage: consent.analytics ? "granted" : "denied",
    ad_storage: consent.advertising ? "granted" : "denied",
    ad_user_data: consent.advertising ? "granted" : "denied",
    ad_personalization: consent.advertising ? "granted" : "denied",
  });
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    anonymize_ip: true,
    allow_google_signals: consent.advertising,
    send_page_view: false,
  });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
  window.__lotLogicGaLoaded = true;
}

function updateGoogleConsent(consent: ConsentState) {
  window.gtag?.("consent", "update", {
    analytics_storage: consent.analytics ? "granted" : "denied",
    ad_storage: consent.advertising ? "granted" : "denied",
    ad_user_data: consent.advertising ? "granted" : "denied",
    ad_personalization: consent.advertising ? "granted" : "denied",
  });
}

function loadPostHog() {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
  if (!token || window.__lotLogicPostHogLoaded) return;

  const queue = [] as unknown as {
    push: (value: unknown) => number;
    init?: (token: string, options?: Record<string, unknown>) => void;
    capture?: (event: string, properties?: Record<string, unknown>) => void;
    opt_out_capturing?: () => void;
    opt_in_capturing?: () => void;
    _i?: unknown[];
    [key: string]: unknown;
  };

  const methodNames = [
    "capture",
    "identify",
    "alias",
    "reset",
    "register",
    "register_once",
    "unregister",
    "opt_out_capturing",
    "opt_in_capturing",
    "get_distinct_id",
  ];

  methodNames.forEach((method) => {
    queue[method] = (...args: unknown[]) =>
      queue.push([method, ...args]);
  });

  queue._i = [];
  queue.init = (projectToken: string, options: Record<string, unknown> = {}) => {
    queue._i?.push([projectToken, options]);
  };

  window.posthog = queue;

  const assetsHost = host
    .replace("us.i.posthog.com", "us-assets.i.posthog.com")
    .replace("eu.i.posthog.com", "eu-assets.i.posthog.com")
    .replace(/\/$/, "");

  const script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = `${assetsHost}/static/array.js`;
  document.head.appendChild(script);

  window.posthog.init?.(token, {
    api_host: host,
    defaults: "2026-05-30",
    autocapture: true,
    capture_pageview: false,
    capture_pageleave: true,
    disable_session_recording: false,
    mask_all_text: false,
    mask_all_element_attributes: false,
    session_recording: {
      maskAllInputs: true,
    },
  });

  window.__lotLogicPostHogLoaded = true;
}

export function PrivacyConsent() {
  const pathname = usePathname();
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [advertising, setAdvertising] = useState(false);

  useEffect(() => {
    const stored = readConsent();
    setConsent(stored);
    setAnalytics(stored?.analytics ?? false);
    setAdvertising(stored?.advertising ?? false);
    setBannerOpen(!stored);
  }, []);

  useEffect(() => {
    function openPreferences() {
      const stored = readConsent();
      setAnalytics(stored?.analytics ?? false);
      setAdvertising(stored?.advertising ?? false);
      setPreferencesOpen(true);
      setBannerOpen(false);
    }

    const buttons = Array.from(
      document.querySelectorAll<HTMLElement>("[data-cookie-preferences]"),
    );
    buttons.forEach((button) =>
      button.addEventListener("click", openPreferences),
    );

    window.addEventListener("lotlogic:cookie-preferences", openPreferences);
    return () => {
      buttons.forEach((button) =>
        button.removeEventListener("click", openPreferences),
      );
      window.removeEventListener("lotlogic:cookie-preferences", openPreferences);
    };
  }, [pathname]);

  useEffect(() => {
    if (!consent) return;

    if (consent.analytics) {
      loadGoogleAnalytics(consent);
      loadPostHog();
      window.posthog?.opt_in_capturing?.();
    } else {
      updateGoogleConsent(consent);
      window.posthog?.opt_out_capturing?.();
    }

    if (consent.analytics && window.__lotLogicGaLoaded) {
      const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
      if (measurementId) {
        window.gtag?.("event", "page_view", {
          page_path: `${pathname}${window.location.search}`,
          page_location: window.location.href,
        });
      }
    }

    if (consent.analytics && window.__lotLogicPostHogLoaded) {
      window.posthog?.capture?.("$pageview", {
        $current_url: window.location.href,
      });
    }
  }, [consent, pathname]);

  function save(nextAnalytics: boolean, nextAdvertising: boolean) {
    const next: ConsentState = {
      essential: true,
      analytics: nextAnalytics,
      advertising: nextAdvertising,
      updatedAt: new Date().toISOString(),
    };
    persistConsent(next);
    setConsent(next);
    setAnalytics(nextAnalytics);
    setAdvertising(nextAdvertising);
    setBannerOpen(false);
    setPreferencesOpen(false);

    if (next.analytics) {
      loadGoogleAnalytics(next);
      loadPostHog();
    }
    updateGoogleConsent(next);
  }

  return (
    <>
      {bannerOpen ? (
        <div className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
          <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <div className="text-sm font-black text-slate-950">Cookies & privacy</div>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                Lot Logic uses essential storage for security and account sessions.
                With your permission, we also use analytics to understand traffic,
                product usage, and campaign performance. Advertising storage is
                reserved for future marketing tools and remains optional.
              </p>
              <div className="mt-2 text-xs font-bold text-slate-500">
                <a href="/cookies" className="text-blue-700 hover:underline">Cookie Policy</a>
                <span className="mx-2">·</span>
                <a href="/privacy" className="text-blue-700 hover:underline">Privacy Policy</a>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => save(false, false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                Reject optional
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreferencesOpen(true);
                  setBannerOpen(false);
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                Manage
              </button>
              <button
                type="button"
                onClick={() => save(true, true)}
                className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800"
              >
                Accept all
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {preferencesOpen ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-6 py-5">
              <h2 className="text-xl font-black text-slate-950">Cookie preferences</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                You can change these choices at any time.
              </p>
            </div>
            <div className="space-y-3 p-6">
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-black text-slate-950">Essential</div>
                    <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                      Authentication, security, session continuity, and core application behavior.
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">Always on</span>
                </div>
              </div>

              <label className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4">
                <div>
                  <div className="font-black text-slate-950">Analytics</div>
                  <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                    Google Analytics and PostHog help us understand acquisition,
                    usage, funnels, and product performance. Session replay, when
                    enabled, masks form inputs.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(event) => setAnalytics(event.target.checked)}
                  className="mt-1 h-5 w-5 accent-slate-950"
                />
              </label>

              <label className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4">
                <div>
                  <div className="font-black text-slate-950">Advertising</div>
                  <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                    Allows future advertising and conversion-measurement tools to
                    use permitted identifiers for campaign measurement and personalization.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={advertising}
                  onChange={(event) => setAdvertising(event.target.checked)}
                  className="mt-1 h-5 w-5 accent-slate-950"
                />
              </label>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setPreferencesOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => save(analytics, advertising)}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white"
              >
                Save preferences
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
