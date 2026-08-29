import Link from "next/link";

import { PartnerProfileForm } from "@/components/partner/partner-profile-form";
import { requirePartnerPortalAccess } from "@/lib/partner-portal/access";
import { getPartnerProfileData } from "@/lib/partner-portal/profile";

export const dynamic = "force-dynamic";

type Props = { searchParams?: Promise<{ onboarding?: string | string[] }> };

export default async function PartnerProfilePage({ searchParams }: Props) {
  const access = await requirePartnerPortalAccess();
  const profile = await getPartnerProfileData(access);
  const resolved = searchParams ? await searchParams : {};
  const onboardingParam = Array.isArray(resolved.onboarding) ? resolved.onboarding[0] : resolved.onboarding;
  const onboarding = onboardingParam === "1" || !profile.profileConfirmedAt;

  return <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-4 px-4 py-4 sm:px-5 lg:px-7">
        <div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Lot Logic Partner Portal</div><div className="mt-0.5 text-lg font-black">{onboarding ? "Welcome" : "Profile"}</div></div>
        {!onboarding ? <nav className="flex gap-2"><Link href="/partner/work" className="rounded-lg px-3 py-2 text-sm font-black text-slate-600">My Work</Link><Link href="/partner/profile" className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-black text-white">Profile</Link></nav> : null}
      </div>
    </header>
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-5 lg:px-7">
      <div className="mb-5">
        <h1 className="text-[30px] font-black tracking-[-0.035em]">{onboarding ? "Confirm your partner profile" : "Your partner profile"}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{onboarding ? "Confirm the details we use to assign and schedule work. You can change these anytime later." : "Keep your contact information, availability, and capabilities current."}</p>
      </div>
      <PartnerProfileForm profile={profile} onboarding={onboarding} />
    </div>
  </main>;
}
