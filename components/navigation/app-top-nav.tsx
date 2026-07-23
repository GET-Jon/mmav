"use client";

import Link from "next/link";

export type AppTopNavPage = "evaluator" | "pipeline" | "rules" | "settings";

type AppTopNavProps = {
  active: AppTopNavPage;
  userEmail?: string | null;
  onNewEvaluation?: () => void;
};

function navClass(isActive: boolean) {
  return isActive
    ? "rounded-lg bg-blue-50 px-3 py-2 text-sm font-extrabold text-blue-700"
    : "rounded-lg px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-950";
}

export function AppTopNav({
  active,
  userEmail = null,
  onNewEvaluation,
}: AppTopNavProps) {
  const userLabel = userEmail?.split("@")[0] || "Mindful Motors";
  const initials =
    userLabel
      .split(/[.\-_\s]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase() || "MM";

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1380px] items-center gap-7 px-5 py-3 lg:px-7">
        <Link href="/" className="flex shrink-0 items-center gap-3">
          <div className="text-[25px] font-black tracking-[-0.06em] text-blue-700">
            MM<span className="text-emerald-600">A</span>V
          </div>

          <div className="hidden border-l border-slate-200 pl-3 text-[9px] font-black uppercase leading-[1.35] tracking-[0.12em] text-slate-600 sm:block">
            Mindful Motors
            <br />
            Auction Valuation
          </div>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <Link href="/" className={navClass(active === "evaluator")}>
            Evaluator
          </Link>

          <Link href="/deals" className={navClass(active === "pipeline")}>
            Pipeline
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
              className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 lg:block"
            >
              New Evaluation
            </button>
          ) : (
            <Link
              href="/"
              className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 lg:block"
            >
              New Evaluation
            </Link>
          )}

          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-700 text-xs font-black text-white">
            {initials}
          </div>

          <div className="hidden min-w-0 sm:block">
            <div className="truncate text-xs font-extrabold text-slate-900">
              {userLabel}
            </div>

            <div className="text-[10px] font-semibold text-slate-500">
              Mindful Motors
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
