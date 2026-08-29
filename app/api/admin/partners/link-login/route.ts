import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const access = await getMindfulInventoryAccess();
  if (!access || access.company.role !== "company_admin") return null;
  return access;
}

export async function POST(request: Request) {
  try {
    const access = await requireAdmin();
    if (!access) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const partnerId = String(body.partnerId || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    if (!partnerId || !email) {
      return NextResponse.json({ error: "Partner and existing login email are required." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: partner, error: partnerError } = await admin
      .from("mindful_inventory_partners")
      .select("id,name,company_id")
      .eq("id", partnerId)
      .eq("company_id", access.company.companyId)
      .maybeSingle();
    if (partnerError) throw new Error(partnerError.message);
    if (!partner) return NextResponse.json({ error: "Partner not found." }, { status: 404 });

    const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersError) throw new Error(usersError.message);
    const authUser = usersData.users.find((candidate) => candidate.email?.trim().toLowerCase() === email);
    if (!authUser) {
      return NextResponse.json(
        { error: "No existing Lot Logic login was found for that email. Create the login first, then link it here." },
        { status: 404 },
      );
    }

    const { data: conflict, error: conflictError } = await admin
      .from("mindful_inventory_partners")
      .select("id,name")
      .eq("company_id", access.company.companyId)
      .eq("user_id", authUser.id)
      .neq("id", partnerId)
      .limit(1)
      .maybeSingle();
    if (conflictError) throw new Error(conflictError.message);
    if (conflict) {
      return NextResponse.json({ error: `That login is already linked to partner ${conflict.name}.` }, { status: 409 });
    }

    const { error: updateError } = await admin
      .from("mindful_inventory_partners")
      .update({ user_id: authUser.id, updated_by: access.userId, updated_at: new Date().toISOString() })
      .eq("id", partnerId)
      .eq("company_id", access.company.companyId);
    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ partnerId, userId: authUser.id, email: authUser.email });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Partner login could not be linked." }, { status: 500 });
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
      .update({ user_id: null, updated_by: access.userId, updated_at: new Date().toISOString() })
      .eq("id", partnerId)
      .eq("company_id", access.company.companyId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ partnerId, unlinked: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Partner login could not be unlinked." }, { status: 500 });
  }
}
