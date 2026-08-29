import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";

function normalizedEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const partnerId = String(requestUrl.searchParams.get("partner") || "").trim();
  const user = await getCurrentUser();

  if (!user?.email) {
    return NextResponse.redirect(new URL("/login?next=/partner", requestUrl.origin));
  }

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("mindful_inventory_partners")
    .select("id,user_id,email,portal_invited_email,portal_access_enabled,portal_profile_confirmed_at,active")
    .eq("active", true)
    .eq("portal_access_enabled", true)
    .eq("portal_invited_email", normalizedEmail(user.email));

  if (partnerId) query = query.eq("id", partnerId);

  const { data: partners, error } = await query
    .order("portal_invited_at", { ascending: false })
    .limit(2);

  if (error) {
    return NextResponse.redirect(new URL(`/partner?error=${encodeURIComponent(error.message)}`, requestUrl.origin));
  }

  const partner = partners?.[0] ?? null;
  if (!partner) {
    return NextResponse.redirect(new URL("/partner?error=No+active+partner+invitation+matched+this+email", requestUrl.origin));
  }

  if (partner.user_id && partner.user_id !== user.id) {
    return NextResponse.redirect(new URL("/partner?error=This+partner+invitation+is+already+claimed", requestUrl.origin));
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("mindful_inventory_partners")
    .update({
      user_id: user.id,
      email: normalizedEmail(user.email),
      portal_claimed_at: partner.user_id === user.id ? undefined : now,
      updated_by: user.id,
      updated_at: now,
    })
    .eq("id", partner.id)
    .eq("portal_access_enabled", true);

  if (updateError) {
    return NextResponse.redirect(new URL(`/partner?error=${encodeURIComponent(updateError.message)}`, requestUrl.origin));
  }

  const destination = partner.portal_profile_confirmed_at
    ? "/partner/work"
    : "/partner/profile?onboarding=1";

  return NextResponse.redirect(new URL(destination, requestUrl.origin));
}
