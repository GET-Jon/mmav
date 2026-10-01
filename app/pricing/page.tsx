import { PricingSection } from "@/components/marketing/pricing-section";
import { LotLogicLogo } from "@/components/lot-logic-logo";
import Link from "next/link";

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-4 lg:px-8">
          <Link href="/" aria-label="Lot Logic home">
            <LotLogicLogo className="h-9" />
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-xl px-4 py-2 text-sm font-black text-slate-600">Sign in</Link>
            <Link href="/signup" className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Start free</Link>
          </div>
        </div>
      </header>
      <PricingSection standalone />
    </main>
  );
}
