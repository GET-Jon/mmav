import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const access = await getMindfulInventoryAccess();
  if (!access || access.company.role !== "company_admin") return null;
  return access;
}

function normalizedEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  return email.includes("@") ? email : "";
}

export async function POST(request: Request) {
  try {
    const access = await requireAdmin();
    if (!access) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const partnerId = String(body.partnerId || "").trim();
    if (!partnerId) return NextResponse.json({ error: "Partner id is required." }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const { data: partner, error: partnerError } = await admin
      .from("mindful_inventory_partners")
      .select("id,name,email,user_id,company_id,portal_profile_confirmed_at")
      .eq("id", partnerId)
      .eq("company_id", access.company.companyId)
      .eq("active", true)
      .maybeSingle();
    if (partnerError) throw new Error(partnerError.message);
    if (!partner) return NextResponse.json({ error: "Partner not found." }, { status: 404 });

    const email = normalizedEmail(body.email || partner.email);
    if (!email) return NextResponse.json({ error: "Add a valid partner email before sending an invitation." }, { status: 400 });

    const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersError) throw new Error(usersError.message);
    let authUser = usersData.users.find((candidate) => candidate.email?.trim().toLowerCase() === email) ?? null;
    const existingAccount = Boolean(authUser);

    const requestUrl = new URL(request.url);
    const redirectTo = `${requestUrl.origin}/auth/partner-invite`;

    if (authUser) {
      const { error: magicError } = await admin.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: redirectTo,
        },
      });
      if (magicError) throw new Error(`Partner sign-in email could not be sent: ${magicError.message}`);
    } else {
      const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: {
          partner_id: partner.id,
          company_id: access.company.companyId,
          invited_as: "partner",
        },
      });
      if (inviteError) throw new Error(`Partner invitation could not be sent: ${inviteError.message}`);
      authUser = inviteData.user;
    }

    if (!authUser) throw new Error("Supabase did not return the invited user.");

    const now = new Date().toISOString();
    const sameUser = partner.user_id === authUser.id;
    const { error: updateError } = await admin
      .from("mindful_inventory_partners")
      .update({
        user_id: authUser.id,
        email,
        portal_invited_at: now,
        portal_invited_email: email,
        portal_access_enabled: true,
        portal_profile_confirmed_at: sameUser ? partner.portal_profile_confirmed_at : null,
        updated_by: access.userId,
        updated_at: now,
      })
      .eq("id", partner.id)
      .eq("company_id", access.company.companyId);
    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({
      partnerId: partner.id,
      email,
      existingAccount,
      profileConfirmed: sameUser && Boolean(partner.portal_profile_confirmed_at),
      sent: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Partner invitation could not be sent." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await requireAdmin();
    if (!access) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const partnerId = String(body.partnerId || "").trim();
    if (!partnerId) return NextResponse.json({ error: "Partner id is required." }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("mindful_inventory_partners")
      .update({
        portal_access_enabled: false,
        updated_by: access.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", partnerId)
      .eq("company_id", access.company.companyId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ partnerId, disabled: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Partner portal access could not be disabled." },
      { status: 500 },
    );
  }
}
