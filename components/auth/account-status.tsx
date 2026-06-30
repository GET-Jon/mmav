"use client";

import { SignOutButton } from "@/components/auth/sign-out-button";

type AccountStatusProps = {
  userEmail?: string | null;
  roleLabel?: string;
  companyLabel?: string;
};

export function AccountStatus({
  userEmail = null,
  roleLabel = "Buyer",
  companyLabel = "Mindful Motor Co.",
}: AccountStatusProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right md:block">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
          {companyLabel}
        </div>
        <div className="max-w-[220px] truncate text-sm font-semibold text-slate-700">
          {userEmail || "Signed in"}
        </div>
      </div>

      <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">
        {roleLabel}
      </div>

      <SignOutButton />
    </div>
  );
}
