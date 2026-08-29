import { getCurrentCompanyForUser } from "@/lib/supabase/company";
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth";

export async function getLotLogicIntelligenceAccess() {
  const supabase = await createSupabaseServerAuthClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  try {
    const company = await getCurrentCompanyForUser(supabase, user.id);
    return {
      supabase,
      userId: user.id,
      userEmail: user.email ?? null,
      company,
      isAdmin: company.role === "company_admin",
    };
  } catch {
    return null;
  }
}
