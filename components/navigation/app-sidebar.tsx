import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";

type AppSidebarProps = {
  active?: "evaluator" | "saved" | "assumptions" | "settings";
  userEmail?: string | null;
};

function navClass(isActive: boolean) {
  return [
    "block rounded-xl px-4 py-3 transition",
    isActive
      ? "bg-cyan-500/20 text-cyan-200"
      : "text-slate-300 hover:bg-white/5",
  ].join(" ");
}

export function AppSidebar({
  active = "evaluator",
  userEmail = null,
}: AppSidebarProps) {
  return (
    <aside className="hidden w-64 shrink-0 bg-slate-950 p-5 text-white lg:block">
      <div className="mb-10 flex items-center justify-center">
        <img
          src="/mindful-badge-sm.png"
          alt="Mindful Motors"
          className="h-16 w-auto object-contain"
        />
      </div>

      <nav className="space-y-2 text-sm">
        <Link href="/" className={navClass(active === "evaluator")}>
          Auction Evaluator
        </Link>

        <Link href="/#market-comps" className={navClass(false)}>
          Market Comps
        </Link>

        <Link href="/deals" className={navClass(active === "saved")}>
          Saved Searches
        </Link>

        <Link href="/assumptions" className={navClass(active === "assumptions")}>
          Rules & Defaults
        </Link>

        <Link href="/settings" className={navClass(active === "settings")}>
          Settings
        </Link>
      </nav>

      <div className="mt-6 border-t border-white/10 pt-5">
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          Signed in
        </div>

        <div className="mb-3 truncate text-sm font-semibold text-slate-200">
          {userEmail || "Unknown user"}
        </div>

        <SignOutButton />
      </div>
    </aside>
  );
}
