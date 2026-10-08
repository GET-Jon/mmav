import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";

export async function getPlatformAdminAccess() {
  const user = await getCurrentUser();
  if (!user) return null;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data?.user_id) return null;

  return {
    admin,
    userId: user.id,
    userEmail: user.email || null,
  };
}

export async function isPlatformAdminUser() {
  return Boolean(await getPlatformAdminAccess());
}
