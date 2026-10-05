import { redirect } from "next/navigation";

import { OnboardingCheckout } from "@/components/onboarding/onboarding-checkout";
import { getCurrentUser } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/signup");
  }

  return <OnboardingCheckout />;
}
