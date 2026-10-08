"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { LotLogicLogo } from "@/components/branding/lot-logic-logo";
import { PlanSelectionModal } from "@/components/billing/plan-selection-modal";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type AppTopNavPage =
  | "evaluator"
  | "pipeline"
  | "insights"
  | "inventory"
  | "schedule"
  | "settings"
  | "admin";

type AppTopNavProps = {
  active: AppTopNavPage;
  userEmail?: string | null;
  userRole?: string | null;
  onNewEvaluation?: () => void;
};

type UsageStatus = {
  internalUnlimited?: boolean;
  trialActive?: boolean;
  paidActive?: boolean;
  trialEvaluationsUsed?: number;
  trialEvaluationsRemaining?: number | null;
  monthlyEvaluationsUsed?: number;
  monthlyEvaluationsRemaining?: number | null;
  giftedEvaluationsRemaining?: number | null;
  effectiveEvaluationsRemaining?: number | null;
  canUsePaidProviders?: boolean;
  limits?: {
    evaluationsPerMonth?: number;
  };
};

function navClass(isActive: boolean) {
  return isActive
    ? "rounded-lg bg-slate-950 px-3 py-2 text-sm font-extrabold text-white"
    : "rounded-lg px-3 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950";
}

export function AppTopNav({ active, userEmail = null, userRole = null, onNewEvaluation }: AppTopNavProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resolvedRole, setResolvedRole] = useState<string | null>(userRole);
  const [resolvedCompanyName, setResolvedCompanyName] = useState<string | null>(null);
  const [resolvedCompanySlug, setResolvedCompanySlug] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [planSelectionOpen, setPlanSelectionOpen] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const userLabel = userEmail?.split("@")[0] || "Mindful Motors";
  const isAdmin = resolvedRole === "company_admin";
  const isMindfulAdmin =
    isAdmin && resolvedCompanySlug === "mindful-motor-co";

  const initials = userLabel
    .split(/[.\-_\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "MM";

  const evaluationUsage = (() => {
    if (!usage || usage.internalUnlimited) return null;

    const gifted = Number(usage.giftedEvaluationsRemaining || 0);

    if (!usage.paidActive) {
      const used = Number(usage.trialEvaluationsUsed || 0);
      const total = 5;
      return {
        used,
        total,
        gifted,
        label:
          gifted > 0
            ? `${Math.min(used, total)}/${total} free · ${gifted} gifted`
            : `${Math.min(used, total)}/${total} free evals`,
      };
    }

    const total = Number(usage.limits?.evaluationsPerMonth || 0);
    if (!total) return null;

    const used = Number(usage.monthlyEvaluationsUsed || 0);
    return {
      used,
      total,
      gifted,
      label:
        gifted > 0
          ? `${used}/${total} evals · ${gifted} gifted`
          : `${used}/${total} evals`,
    };
  })();

  const trialPaywallReached =
    Boolean(usage) &&
    !usage?.paidActive &&
    usage?.canUsePaidProviders === false;

  const evaluationUsageTone = (() => {
    if (!evaluationUsage) return "border-slate-200 bg-slate-50 text-slate-600";

    if (Number(evaluationUsage.gifted || 0) > 0) {
      return "border-amber-400 bg-amber-100 text-amber-900 shadow-[0_0_0_1px_rgba(245,158,11,0.08)]";
    }

    const remainingRatio = Math.max(
      0,
      (evaluationUsage.total - evaluationUsage.used) / evaluationUsage.total,
    );

    if (remainingRatio === 0) {
      return "border-red-200 bg-red-50 text-red-700";
    }
    if (remainingRatio <= 0.2) {
      return "border-amber-200 bg-amber-50 text-amber-800";
    }
    return "border-blue-200 bg-blue-50 text-blue-700";
  })();

  useEffect(() => {
    if (!userEmail) return;
    let cancelled = false;
    void (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: membership } = await supabase
        .from("company_memberships")
        .select("role,company_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!membership || cancelled) return;

      if (!resolvedRole) {
        setResolvedRole(membership.role || "user");
      }

      const { data: company } = await supabase
        .from("companies")
        .select("name,slug")
        .eq("id", membership.company_id)
        .maybeSingle();

      if (!cancelled) {
        setResolvedCompanyName(company?.name || null);
        setResolvedCompanySlug(company?.slug || null);
      }
    })();
    return () => { cancelled = true; };
  }, [resolvedRole, userEmail]);

  useEffect(() => {
    if (!userEmail) return;

    let cancelled = false;

    async function loadPlatformAdminStatus() {
      try {
        const response = await fetch("/api/admin/platform-status", {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          isPlatformAdmin?: boolean;
        };
        if (!cancelled && response.ok) {
          setIsPlatformAdmin(Boolean(payload.isPlatformAdmin));
        }
      } catch {
        if (!cancelled) setIsPlatformAdmin(false);
      }
    }

    void loadPlatformAdminStatus();

    return () => {
      cancelled = true;
    };
  }, [userEmail]);

  useEffect(() => {
    if (!userEmail) return;

    let cancelled = false;

    async function loadUsage() {
      try {
        const response = await fetch("/api/usage/status", { cache: "no-store" });
        const payload = (await response.json()) as UsageStatus;
        if (!cancelled && response.ok) setUsage(payload);
      } catch {
        // Usage is supplemental navigation context. Do not interrupt the app
        // if it cannot be loaded.
      }
    }

    void loadUsage();
    window.addEventListener("focus", loadUsage);
    window.addEventListener("pageshow", loadUsage);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", loadUsage);
      window.removeEventListener("pageshow", loadUsage);
    };
  }, [userEmail]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      window.location.replace("/");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
      <div className="relative mx-auto flex max-w-[1480px] items-center px-5 py-3 lg:px-7">
        <Link href="/" aria-label="Lot Logic home" className="shrink-0 text-slate-950 transition-opacity hover:opacity-75">
          <div className="sm:hidden"><LotLogicLogo compact /></div>
          <div className="hidden sm:block"><LotLogicLogo /></div>
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
          <Link href="/evaluate" className={navClass(active === "evaluator")}>Evaluator</Link>
          <Link href="/deals" className={navClass(active === "pipeline")}>Pipeline</Link>
          <Link href="/insights" className={navClass(active === "insights")}>Insights</Link>
          {isPlatformAdmin ? (
            <Link href="/admin/customers" className={navClass(active === "admin")}>
              Platform Admin
            </Link>
          ) : null}
          {isMindfulAdmin ? <Link href="/mindful/inventory" className={navClass(active === "inventory")}>Inventory</Link> : null}
          {isMindfulAdmin ? <Link href="/mindful/inventory/schedule" className={navClass(active === "schedule")}>Schedule</Link> : null}
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-3">
          {evaluationUsage ? (
            trialPaywallReached ? (
              <button
                type="button"
                data-evaluation-limit-allowed="true"
                title="Choose a plan to keep evaluating"
                onClick={() => setPlanSelectionOpen(true)}
                className={`hidden rounded-xl border px-3 py-2 text-xs font-black transition hover:brightness-95 lg:block ${evaluationUsageTone}`}
              >
                {evaluationUsage.label}
              </button>
            ) : (
              <Link
                href="/settings?tab=billing"
                data-evaluation-limit-allowed="true"
                title="View evaluation usage and plan options"
                className={`hidden rounded-xl border px-3 py-2 text-xs font-black transition hover:brightness-95 lg:block ${evaluationUsageTone}`}
              >
                {evaluationUsage.label}
              </Link>
            )
          ) : null}

          {onNewEvaluation ? (
            <button type="button" onClick={onNewEvaluation} className="hidden rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 lg:block">New Evaluation</button>
          ) : (
            <Link href="/evaluate/new" prefetch={false} className="hidden rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 lg:block">New Evaluation</Link>
          )}

          <div ref={menuRef} className="relative">
            <button type="button" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)} className="flex items-center gap-3 rounded-xl px-1.5 py-1 transition hover:bg-slate-50">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-950 text-xs font-black text-white">{initials}</div>
              <div className="hidden min-w-0 text-left sm:block">
                <div className="truncate text-xs font-extrabold text-slate-900">{userLabel}</div>
                <div className="text-[10px] font-semibold text-slate-500">{resolvedCompanyName || "Your company"}</div>
              </div>
              <span className="hidden text-[10px] font-black text-slate-400 sm:block">{menuOpen ? "▲" : "▼"}</span>
            </button>

            {menuOpen ? (
              <div role="menu" className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="border-b border-slate-100 px-4 py-3">
                  <div className="truncate text-xs font-black text-slate-950">{userEmail || userLabel}</div>
                  <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {isPlatformAdmin
                      ? "Platform Admin"
                      : isMindfulAdmin
                        ? "Mindful Admin"
                        : isAdmin
                          ? "Company Admin"
                          : "User"}
                  </div>
                </div>
                <div className="p-1.5">
                  <Link role="menuitem" href="/settings" onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-950">Settings</Link>
                  {isPlatformAdmin ? (
                    <Link
                      role="menuitem"
                      href="/admin/customers"
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-lg px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-950"
                    >
                      Platform Admin
                    </Link>
                  ) : isMindfulAdmin ? (
                    <Link
                      role="menuitem"
                      href="/admin"
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-lg px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-950"
                    >
                      Admin
                    </Link>
                  ) : null}
                </div>
                {userEmail ? (
                  <div className="border-t border-slate-100 p-1.5">
                    <button role="menuitem" type="button" onClick={() => void signOut()} disabled={signingOut} className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">{signingOut ? "Logging out…" : "Log Out"}</button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      </header>
      {planSelectionOpen ? (
        <PlanSelectionModal
          message="You’ve used your free evaluations. Choose a plan to continue."
          onClose={() => setPlanSelectionOpen(false)}
        />
      ) : null}
    </>
  );
}
