"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { LotLogicLogo } from "@/components/branding/lot-logic-logo";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type AppTopNavPage =
  | "evaluator"
  | "pipeline"
  | "inventory"
  | "schedule"
  | "rules"
  | "settings"
  | "admin";

type AppTopNavProps = {
  active: AppTopNavPage;
  userEmail?: string | null;
  userRole?: string | null;
  onNewEvaluation?: () => void;
};

function navClass(isActive: boolean) {
  return isActive
    ? "rounded-lg bg-slate-950 px-3 py-2 text-sm font-extrabold text-white"
    : "rounded-lg px-3 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950";
}

export function AppTopNav({
  active,
  userEmail = null,
  userRole = null,
  onNewEvaluation,
}: AppTopNavProps) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const userLabel = userEmail?.split("@")[0] || "Mindful Motors";
  const isAdmin = userRole === "company_admin";

  const initials =
    userLabel
      .split(/[.\-_\s]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase() || "MM";

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
      router.push("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="relative mx-auto flex max-w-[1480px] items-center px-5 py-3 lg:px-7">
        <Link href="/" aria-label="Lot Logic evaluator" className="shrink-0 text-slate-950 transition-opacity hover:opacity-75">
          <div className="sm:hidden"><LotLogicLogo compact /></div>
          <div className="hidden sm:block"><LotLogicLogo /></div>
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
          <Link href="/" className={navClass(active === "evaluator")}>Evaluator</Link>
          <Link href="/deals" className={navClass(active === "pipeline")}>Pipeline</Link>
          <Link href="/mindful/inventory" className={navClass(active === "inventory")}>Inventory</Link>
          <Link href="/mindful/inventory/schedule" className={navClass(active === "schedule")}>Schedule</Link>
          <Link href="/assumptions" className={navClass(active === "rules")}>Rules</Link>
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-3">
          {onNewEvaluation ? (
            <button type="button" onClick={onNewEvaluation} className="hidden rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 lg:block">New Evaluation</button>
          ) : (
            <Link href="/" className="hidden rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 lg:block">New Evaluation</Link>
          )}

          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
              className="flex items-center gap-3 rounded-xl px-1.5 py-1 transition hover:bg-slate-50"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-950 text-xs font-black text-white">{initials}</div>
              <div className="hidden min-w-0 text-left sm:block">
                <div className="truncate text-xs font-extrabold text-slate-900">{userLabel}</div>
                <div className="text-[10px] font-semibold text-slate-500">Mindful Motor Co.</div>
              </div>
              <span className="hidden text-[10px] font-black text-slate-400 sm:block">{menuOpen ? "▲" : "▼"}</span>
            </button>

            {menuOpen ? (
              <div role="menu" className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="border-b border-slate-100 px-4 py-3">
                  <div className="truncate text-xs font-black text-slate-950">{userEmail || userLabel}</div>
                  <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{isAdmin ? "Administrator" : "User"}</div>
                </div>
                <div className="p-1.5">
                  <Link role="menuitem" href="/settings" onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-950">User Settings</Link>
                  {isAdmin ? <Link role="menuitem" href="/admin" onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-950">Admin</Link> : null}
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
  );
}
