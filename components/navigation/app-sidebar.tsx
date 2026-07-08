import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";

type AppSidebarProps = {
  active?: "evaluator" | "saved" | "assumptions" | "settings";
  userEmail?: string | null;
};

function navClass(isActive: boolean, subtle = false) {
  return [
    "block rounded-xl px-3 py-2.5 text-[13px] font-semibold tracking-[-0.01em] transition",
    isActive
      ? "bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-300/15"
      : subtle
      ? "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
      : "text-slate-300 hover:bg-white/[0.05] hover:text-white",
  ].join(" ");
}

function NavSection({
  label,
  children,
  separated = false,
}: {
  label: string;
  children: ReactNode;
  separated?: boolean;
}) {
  return (
    <div className={separated ? "mt-4 border-t border-white/10 pt-4" : ""}>
      <div className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

export function AppSidebar({ active = "evaluator", userEmail = null }: AppSidebarProps) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 bg-[#070b18] p-5 text-white lg:flex lg:flex-col">
      <div className="mb-9 flex items-center justify-center">
        <img
          src="/mindful-badge-sm.png"
          alt="Mindful Motors"
          className="h-16 w-auto object-contain drop-shadow-sm"
        />
      </div>

      <nav className="flex-1">
        <NavSection label="Daily Use">
          <Link href="/" className={navClass(active === "evaluator")}>
            Auction Evaluator
          </Link>

          <Link href="/#market-comps" className={navClass(false, true)}>
            Jump to Comps
          </Link>

          <Link href="/deals" className={navClass(active === "saved")}>
            Deal Pipeline
          </Link>
        </NavSection>

        <NavSection label="Configuration" separated>
          <Link href="/assumptions" className={navClass(active === "assumptions")}>
            Rules & Defaults
          </Link>

          <Link href="/settings" className={navClass(active === "settings")}>
            Settings
          </Link>
        </NavSection>
      </nav>

      <div className="mt-6 border-t border-white/10 pt-5">
        <div className="px-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
          Mindful Motor Co.
        </div>

        <div className="mt-2 max-w-full truncate px-3 text-[13px] font-semibold text-slate-200">
          {userEmail || "Signed in"}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 px-3">
          <span className="rounded-full bg-white/8 px-3 py-1 text-xs font-bold text-slate-200 ring-1 ring-white/10">
            Buyer
          </span>

          <div className="[&_button]:rounded-full [&_button]:border [&_button]:border-white/10 [&_button]:bg-white/8 [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-xs [&_button]:font-bold [&_button]:text-slate-100 [&_button]:shadow-none [&_button]:hover:bg-white/12">
            <SignOutButton />
          </div>
        </div>
      </div>
    </aside>
  );
}
