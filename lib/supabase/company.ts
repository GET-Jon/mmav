import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_COMPANY_SLUG = "mindful-motor-co";

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
