"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type CancellationUsage = {
  company?: { companyId?: string };
  status?: string;
  postCancelBalance?: number;
  postCancelRemaining?: number;
  postCancelActive?: boolean;
  postCancelStartsAt?: string | null;
  postCancelExpiresAt?: string | null;
};

function dateWithTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

/**
 * Show once after Stripe confirms that a paid subscription has actually ended,
 * not when a user merely schedules cancellation. Dismissal is per dealership
 * and canceled billing cycle on the current device.
 */
export function CancellationReturnNotice({ usage }: { usage: CancellationUsage | null }) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [noticeKey, setNoticeKey] = useState<string | null>(null);
  const start = usage?.postCancelStartsAt || "";
  const end = usage?.postCancelExpiresAt || "";
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const isFutureWindow = Number.isFinite(startMs) && Date.now() < startMs;
  const credits = isFutureWindow
    ? Number(usage?.postCancelBalance || 0)
    : Number(usage?.postCancelRemaining || 0);
  const valid =
    usage?.status === "canceled" &&
    Boolean(usage?.company?.companyId) &&
    credits > 0 &&
    Number.isFinite(startMs) &&
    Number.isFinite(endMs) &&
    Date.now() < endMs;
  const key = valid
    ? `lotlogic:cancellation-acknowledged:${usage?.company?.companyId}:${start}`
    : null;

  useEffect(() => {
    if (!key) {
      setNoticeKey(null);
      return;
    }
    try {
      if (window.localStorage.getItem(key) === "yes") {
        setNoticeKey(null);
        return;
      }
    } catch {
      // Browser storage may be disabled; dismissing still works for this view.
    }
    setNoticeKey(key);
  }, [key]);

  const open = Boolean(noticeKey && noticeKey === key && dismissedKey !== key);

  useEffect(() => {
    if (!open) return;
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
    // dismiss only depends on the current key; a stale modal is never shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  function dismiss() {
    if (!key) return;
    try {
      window.localStorage.setItem(key, "yes");
    } catch {
      // In private browsing the in-memory state still dismisses this notice.
    }
    setDismissedKey(key);
    setNoticeKey(null);
  }

  if (!open || !key) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center overflow-y-auto bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancellation-return-title"
        className="w-full max-w-xl rounded-2xl bg-white p-6 text-slate-900 shadow-2xl sm:p-8"
      >
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">Your cancellation is confirmed</p>
        <h2 id="cancellation-return-title" className="mt-2 text-2xl font-black leading-tight">
          Your unused paid evaluations are yours to use.
        </h2>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">
          Your subscription has ended and will not renew.
          You have <strong>{credits} paid evaluations</strong> preserved for the 30-day period after cancellation.
        </p>
        <dl className="mt-5 space-y-3 rounded-xl bg-blue-50 p-4 text-sm">
          <div>
            <dt className="font-bold text-blue-800">{isFutureWindow ? "Available starting" : "Available now"}</dt>
            <dd className="mt-1 font-black text-blue-950">
              {isFutureWindow ? dateWithTime(start) : `${credits} evaluations remaining`}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-blue-800">Credits expire</dt>
            <dd className="mt-1 font-black text-blue-950">{dateWithTime(end)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs font-semibold leading-5 text-slate-600">
          You will not be billed again for this canceled subscription.
          No new monthly credits will be issued. Free-trial bonuses do not carry over.
          All your existing evaluations, comps, and pipeline records remain saved.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={dismiss} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">
            Got it
          </button>
          <Link href="/settings?tab=billing" onClick={dismiss} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-blue-700">
            View credits & expiry
          </Link>
        </div>
      </section>
    </div>
  );
}
