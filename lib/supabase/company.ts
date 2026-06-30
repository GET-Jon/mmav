import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_COMPANY_SLUG = "mindful-motor-co";

export type CurrentCompanyContext = {
  companyId: string;
  companyName: string;
  companySlug: string;
  role: string;
};

export async function getDefaultCompanyId(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("companies")
    .select("id")
    .eq("slug", DEFAULT_COMPANY_SLUG)
    .single();

  if (error || !data?.id) {
    throw new Error("Default company not found.");
  }

  return data.id as string;
}

export async function getCurrentCompanyForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<CurrentCompanyContext> {
  const { data, error } = await supabase
    .from("company_memberships")
    .select(
      `
      company_id,
      role,
      company:companies (
        id,
        name,
        slug,
        status
      )
    `
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const company = Array.isArray(data?.company)
    ? data?.company[0]
    : data?.company;

  if (!data?.company_id || !company?.id) {
    throw new Error("No active company membership found for this user.");
  }

  if (company.status && company.status !== "active") {
    throw new Error("The current company is not active.");
  }

  return {
    companyId: data.company_id as string,
    companyName: String(company.name || "Company"),
    companySlug: String(company.slug || ""),
    role: String(data.role || "member"),
  };
}
