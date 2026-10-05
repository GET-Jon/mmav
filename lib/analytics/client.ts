"use client";

type AnalyticsWindow = Window & {
  gtag?: (...args: unknown[]) => void;
  posthog?: {
    capture?: (event: string, properties?: Record<string, unknown>) => void;
  };
};

export function trackEvent(
  name: string,
  properties: Record<string, unknown> = {},
) {
  if (typeof window === "undefined") return;

  const analyticsWindow = window as AnalyticsWindow;

  analyticsWindow.gtag?.("event", name, properties);
  analyticsWindow.posthog?.capture?.(name, properties);
}
