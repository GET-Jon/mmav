"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LotLogicLogo } from "@/components/branding/lot-logic-logo";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type AppTopNavPage =
  | "evaluator"
  | "pipeline"
  | "inventory"
  | "rules"
  | "settings";

type AppTopNavProps = {
  active: AppTopNavPage;
  userEmail?: string | null;
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
  onNewEvaluation,
}: AppTopNavProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const userLabel = userEmail?.split("@")[0] || "Mindful Motors";

  const initials =
    userLabel
      .split(/[.\-_\s]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase() || "MM";

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
      <div className="relative mx-auto flex max-w-[1380px] items-center px-5 py-3 lg:px-7">
        <Link
          href="/"
          aria-label="Lot Logic evaluator"
          className="shrink-0 text-slate-950 transition-opacity hover:opacity-75"
        >
          <div className="sm:hidden">
            <LotLogicLogo compact />
          </div>

          <div className="hidden sm:block">
            <LotLogicLogo />
          </div>
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
          <Link href="/" className={navClass(active === "evaluator")}>
            Evaluator
          </Link>

          <Link href="/deals" className={navClass(active === "pipeline")}>
            Pipeline
          </Link>

          <Link
            href="/mindful/inventory"
            className={navClass(active === "inventory")}
          >
            Inventory
          </Link>

          <Link href="/assumptions" className={navClass(active === "rules")}>
            Rules
          </Link>

          <Link href="/settings" className={navClass(active === "settings")}>
            Settings
          </Link>
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-3">
          {onNewEvaluation ? (
            <button
              type="button"
              onClick={onNewEvaluation}
              className="hidden rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 lg:block"
            >
              New Evaluation
            </button>
          ) : (
            <Link
              href="/"
              className="hidden rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 lg:block"
            >
              New Evaluation
            </Link>
          )}

          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-950 text-xs font-black text-white">
            {initials}
          </div>

          <div className="hidden min-w-0 sm:block">
            <div className="truncate text-xs font-extrabold text-slate-900">
              {userLabel}
            </div>

            <div className="text-[10px] font-semibold text-slate-500">
              Mindful Motor Co.
            </div>
          </div>

          {userEmail ? (
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={signingOut}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-extrabold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 disabled:opacity-50"
            >
              {signingOut ? "Logging out…" : "Log out"}
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
