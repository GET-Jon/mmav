import { redirect } from "next/navigation";

import { EvaluationWorkspace } from "@/components/evaluation/evaluation-workspace";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";

export default async function Home() {
  const user = await getCurrentUser();

  if (user) {
    const admin = createSupabaseAdminClient();

    const { data: membership, error: membershipError } = await admin
      .from("company_memberships")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (membershipError) throw new Error(membershipError.message);

    if (!membership) {
      const { data: partner, error: partnerError } = await admin
        .from("mindful_inventory_partners")
        .select("id,portal_profile_confirmed_at")
        .eq("user_id", user.id)
        .eq("active", true)
        .eq("portal_access_enabled", true)
        .limit(1)
        .maybeSingle();

      if (partnerError) throw new Error(partnerError.message);

      if (partner) {
        redirect(
          partner.portal_profile_confirmed_at
            ? "/partner/work"
            : "/partner/profile?onboarding=1",
        );
      }
    }
  }

  return <EvaluationWorkspace userEmail={user?.email} />;
}
