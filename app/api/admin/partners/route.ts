import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { defaultPartnerPermissions } from "@/lib/admin/partners";

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

async function requireAdmin() {
  const access = await getMindfulInventoryAccess();
  if (!access || access.company.role !== "company_admin") return null;
  return access;
}

export async function POST(request: Request) {
  try {
    const access = await requireAdmin();
    if (!access) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    const body = await request.json();
    const name = clean(body.name);
    if (!name) return NextResponse.json({ error: "Partner name is required." }, { status: 400 });

    const { data: partner, error } = await access.supabase
      .from("mindful_inventory_partners")
      .insert({
        company_id: access.company.companyId,
        name,
        company_name: clean(body.companyName),
        email: clean(body.email),
        phone: clean(body.phone),
        active: true,
        scheduling_mode: "manager_scheduled",
        notes: clean(body.notes),
        created_by: access.userId,
        updated_by: access.userId,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { error: permissionError } = await access.supabase
      .from("mindful_inventory_partner_permissions")
      .insert({ partner_id: partner.id, ...defaultPartnerPermissions });
    if (permissionError) return NextResponse.json({ error: permissionError.message }, { status: 500 });

    return NextResponse.json({ id: partner.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create partner." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireAdmin();
    if (!access) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    const body = await request.json();
    const partnerId = String(body.partnerId || "").trim();
    if (!partnerId) return NextResponse.json({ error: "Partner id is required." }, { status: 400 });

    const { data: existing, error: lookupError } = await access.supabase
      .from("mindful_inventory_partners")
      .select("id")
      .eq("id", partnerId)
      .eq("company_id", access.company.companyId)
      .single();
    if (lookupError || !existing) return NextResponse.json({ error: "Partner not found." }, { status: 404 });

    const name = clean(body.name);
    if (!name) return NextResponse.json({ error: "Partner name is required." }, { status: 400 });

    const now = new Date().toISOString();
    const { error: updateError } = await access.supabase
      .from("mindful_inventory_partners")
      .update({
        name,
        company_name: clean(body.companyName),
        email: clean(body.email),
        phone: clean(body.phone),
        active: body.active !== false,
        notes: clean(body.notes),
        updated_by: access.userId,
        updated_at: now,
      })
      .eq("id", partnerId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    const capabilityIds = Array.isArray(body.capabilityIds) ? body.capabilityIds.map(String) : [];
    const { error: deleteCapabilitiesError } = await access.supabase
      .from("mindful_inventory_partner_capability_assignments")
      .delete()
      .eq("partner_id", partnerId);
    if (deleteCapabilitiesError) return NextResponse.json({ error: deleteCapabilitiesError.message }, { status: 500 });

    if (capabilityIds.length) {
      const { error: capabilityError } = await access.supabase
        .from("mindful_inventory_partner_capability_assignments")
        .insert(capabilityIds.map((capabilityId: string) => ({ partner_id: partnerId, capability_id: capabilityId })));
      if (capabilityError) return NextResponse.json({ error: capabilityError.message }, { status: 500 });
    }

    const permissions = { ...defaultPartnerPermissions, ...(body.permissions || {}) };
    const { error: permissionError } = await access.supabase
      .from("mindful_inventory_partner_permissions")
      .upsert({ partner_id: partnerId, ...permissions, updated_at: now });
    if (permissionError) return NextResponse.json({ error: permissionError.message }, { status: 500 });

    return NextResponse.json({ id: partnerId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update partner." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await requireAdmin();
    if (!access) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const partnerId = String(body.partnerId || "").trim();
    if (!partnerId) return NextResponse.json({ error: "Partner id is required." }, { status: 400 });

    const { count, error: usageError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .select("id", { count: "exact", head: true })
      .eq("assigned_partner_id", partnerId);
    if (usageError) return NextResponse.json({ error: usageError.message }, { status: 500 });

    if ((count || 0) > 0) {
      const { error } = await access.supabase
        .from("mindful_inventory_partners")
        .update({ active: false, updated_by: access.userId, updated_at: new Date().toISOString() })
        .eq("id", partnerId)
        .eq("company_id", access.company.companyId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ id: partnerId, deactivated: true });
    }

    const { error } = await access.supabase
      .from("mindful_inventory_partners")
      .delete()
      .eq("id", partnerId)
      .eq("company_id", access.company.companyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: partnerId, deleted: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to remove partner." }, { status: 500 });
  }
}
