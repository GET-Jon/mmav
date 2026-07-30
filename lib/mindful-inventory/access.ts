import {
  DEFAULT_COMPANY_SLUG,
  getCurrentCompanyForUser,
  type CurrentCompanyContext,
} from "@/lib/supabase/company";
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth";

export const MINDFUL_INVENTORY_COMPANY_SLUG = DEFAULT_COMPANY_SLUG;

export type MindfulInventoryAccess = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>;
  userId: string;
  userEmail: string | null;
  company: CurrentCompanyContext;
};

export async function getMindfulInventoryAccess(): Promise<MindfulInventoryAccess | null> {
  const supabase = await createSupabaseServerAuthClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  let company: CurrentCompanyContext;

  try {
    company = await getCurrentCompanyForUser(supabase, user.id);
  } catch {
    return null;
  }

  if (company.companySlug !== MINDFUL_INVENTORY_COMPANY_SLUG) {
    return null;
  }

  return {
    supabase,
    userId: user.id,
    userEmail: user.email ?? null,
    company,
  };
}

export async function requireMindfulInventoryAccess(): Promise<MindfulInventoryAccess> {
  const access = await getMindfulInventoryAccess();

  if (!access) {
    throw new Error("Mindful Inventory access denied.");
  }

  return access;
}
