import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import {
  defaultPartnerPermissions,
  defaultPartnerStandardHours,
  type AdminPartnerPermissionSet,
  type PartnerSchedulingMode,
  type PartnerStandardHours,
} from "@/lib/admin/partners";

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

const permissionKeys = Object.keys(defaultPartnerPermissions) as Array<keyof AdminPartnerPermissionSet>;
const schedulingModes = new Set<PartnerSchedulingMode>(["manager_scheduled", "partner_availability", "coordination_required", "partner_self_scheduling"]);
const days = Object.keys(defaultPartnerStandardHours) as Array<keyof PartnerStandardHours>;

function normalizePermissions(value: unknown): AdminPartnerPermissionSet {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return permissionKeys.reduce((permissions, key) => {
    permissions[key] = typeof source[key] === "boolean" ? Boolean(source[key]) : defaultPartnerPermissions[key];
    return permissions;
  }, { ...defaultPartnerPermissions });
}

function normalizeCapabilityIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
}

function validTime(value: unknown) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeStandardHours(value: unknown): PartnerStandardHours {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const next = structuredClone(defaultPartnerStandardHours);
  for (const day of days) {
    const row = source[day] && typeof source[day] === "object" ? source[day] as Record<string, unknown> : {};
    const enabled = typeof row.enabled === "boolean" ? row.enabled : next[day].enabled;
    const start = validTime(row.start) ? String(row.start) : next[day].start;
    const end = validTime(row.end) ? String(row.end) : next[day].end;
    if (enabled && start >= end) throw new Error(`${day.toUpperCase()} hours must end after they start.`);
    next[day] = { enabled, start, end };
  }
  return next;
}

function normalizeSchedulingMode(value: unknown): PartnerSchedulingMode {
  const mode = String(value || "manager_scheduled") as PartnerSchedulingMode;
  return schedulingModes.has(mode) ? mode : "manager_scheduled";
}

async function requireAdmin() {
  const access = await getMindfulInventoryAccess();
  if (!access || access.company.role !== "company_admin") return null;
  return access;
}

async function validateCapabilityIds(
  access: NonNullable<Awaited<ReturnType<typeof requireAdmin>>>,
  capabilityIds: string[],
) {
  if (!capabilityIds.length) return { validIds: [] as string[], error: null as string | null };
  const { data, error } = await access.supabase.from("mindful_inventory_partner_capabilities").select("id").eq("company_id", access.company.companyId).in("id", capabilityIds);
  if (error) return { validIds: [] as string[], error: error.message };
  const validIds = (data || []).map((row) => row.id);
  if (validIds.length !== capabilityIds.length) return { validIds, error: "One or more selected capabilities are not available for this company." };
  return { validIds, error: null as string | null };
}

async function validatePrimaryLocationId(
  access: NonNullable<Awaited<ReturnType<typeof requireAdmin>>>,
  value: unknown,
) {
  const locationId = String(value || "").trim();
  if (!locationId) return { locationId: null as string | null, error: null as string | null };
  const { data, error } = await access.supabase.from("mindful_inventory_locations").select("id").eq("id", locationId).eq("company_id", access.company.companyId).eq("active", true).maybeSingle();
  if (error) return { locationId: null as string | null, error: error.message };
  if (!data) return { locationId: null as string | null, error: "Selected preferred work location is not available for this company." };
  return { locationId, error: null as string | null };
}

async function savePrimaryLocation(access: NonNullable<Awaited<ReturnType<typeof requireAdmin>>>, partnerId: string, locationId: string | null) {
  const { error: deleteError } = await access.supabase.from("mindful_inventory_partner_locations").delete().eq("partner_id", partnerId);
  if (deleteError) throw new Error(deleteError.message);
  if (!locationId) return;
  const { error } = await access.supabase.from("mindful_inventory_partner_locations").insert({ partner_id: partnerId, location_id: locationId, is_primary: true, can_work_mobile: false });
  if (error) throw new Error(error.message);
}

export async function POST(request: Request) {
  try {
    const access = await requireAdmin();
    if (!access) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    const body = await request.json();
    const name = clean(body.name);
    if (!name) return NextResponse.json({ error: "Partner name is required." }, { status: 400 });

    const capabilityIds = normalizeCapabilityIds(body.capabilityIds);
    const capabilityValidation = await validateCapabilityIds(access, capabilityIds);
    if (capabilityValidation.error) return NextResponse.json({ error: capabilityValidation.error }, { status: 400 });
    const permissions = normalizePermissions(body.permissions);
    const schedulingMode = normalizeSchedulingMode(body.schedulingMode);
    const standardHours = normalizeStandardHours(body.standardHours);
    const locationValidation = await validatePrimaryLocationId(access, body.primaryLocationId);
    if (locationValidation.error) return NextResponse.json({ error: locationValidation.error }, { status: 400 });

    const { data: partner, error } = await access.supabase
      .from("mindful_inventory_partners")
      .insert({
        company_id: access.company.companyId,
        name,
        company_name: clean(body.companyName),
        email: clean(body.email),
        phone: clean(body.phone),
        active: body.active !== false,
        scheduling_mode: schedulingMode,
        standard_hours: standardHours,
        notes: clean(body.notes),
        created_by: access.userId,
        updated_by: access.userId,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (capabilityValidation.validIds.length) {
      const { error: capabilityError } = await access.supabase.from("mindful_inventory_partner_capability_assignments").insert(capabilityValidation.validIds.map((capabilityId) => ({ partner_id: partner.id, capability_id: capabilityId })));
      if (capabilityError) {
        await access.supabase.from("mindful_inventory_partners").delete().eq("id", partner.id);
        return NextResponse.json({ error: capabilityError.message }, { status: 500 });
      }
    }

    await savePrimaryLocation(access, partner.id, locationValidation.locationId);

    const { error: permissionError } = await access.supabase.from("mindful_inventory_partner_permissions").insert({ partner_id: partner.id, ...permissions });
    if (permissionError) {
      await access.supabase.from("mindful_inventory_partners").delete().eq("id", partner.id);
      return NextResponse.json({ error: permissionError.message }, { status: 500 });
    }

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

    const { data: existing, error: lookupError } = await access.supabase.from("mindful_inventory_partners").select("id").eq("id", partnerId).eq("company_id", access.company.companyId).single();
    if (lookupError || !existing) return NextResponse.json({ error: "Partner not found." }, { status: 404 });

    const name = clean(body.name);
    if (!name) return NextResponse.json({ error: "Partner name is required." }, { status: 400 });
    const capabilityIds = normalizeCapabilityIds(body.capabilityIds);
    const capabilityValidation = await validateCapabilityIds(access, capabilityIds);
    if (capabilityValidation.error) return NextResponse.json({ error: capabilityValidation.error }, { status: 400 });
    const permissions = normalizePermissions(body.permissions);
    const schedulingMode = normalizeSchedulingMode(body.schedulingMode);
    const standardHours = normalizeStandardHours(body.standardHours);
    const locationValidation = await validatePrimaryLocationId(access, body.primaryLocationId);
    if (locationValidation.error) return NextResponse.json({ error: locationValidation.error }, { status: 400 });
    const now = new Date().toISOString();

    const { error: updateError } = await access.supabase
      .from("mindful_inventory_partners")
      .update({
        name,
        company_name: clean(body.companyName),
        email: clean(body.email),
        phone: clean(body.phone),
        active: body.active !== false,
        scheduling_mode: schedulingMode,
        standard_hours: standardHours,
        notes: clean(body.notes),
        updated_by: access.userId,
        updated_at: now,
      })
      .eq("id", partnerId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    await savePrimaryLocation(access, partnerId, locationValidation.locationId);

    const { error: deleteCapabilitiesError } = await access.supabase.from("mindful_inventory_partner_capability_assignments").delete().eq("partner_id", partnerId);
    if (deleteCapabilitiesError) return NextResponse.json({ error: deleteCapabilitiesError.message }, { status: 500 });
    if (capabilityValidation.validIds.length) {
      const { error: capabilityError } = await access.supabase.from("mindful_inventory_partner_capability_assignments").insert(capabilityValidation.validIds.map((capabilityId) => ({ partner_id: partnerId, capability_id: capabilityId })));
      if (capabilityError) return NextResponse.json({ error: capabilityError.message }, { status: 500 });
    }

    const { error: permissionError } = await access.supabase.from("mindful_inventory_partner_permissions").upsert({ partner_id: partnerId, ...permissions, updated_at: now }, { onConflict: "partner_id" });
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
    const { count, error: usageError } = await access.supabase.from("mindful_inventory_work_orders").select("id", { count: "exact", head: true }).eq("assigned_partner_id", partnerId);
    if (usageError) return NextResponse.json({ error: usageError.message }, { status: 500 });
    if ((count || 0) > 0) {
      const { error } = await access.supabase.from("mindful_inventory_partners").update({ active: false, updated_by: access.userId, updated_at: new Date().toISOString() }).eq("id", partnerId).eq("company_id", access.company.companyId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ id: partnerId, deactivated: true });
    }
    const { error } = await access.supabase.from("mindful_inventory_partners").delete().eq("id", partnerId).eq("company_id", access.company.companyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: partnerId, deleted: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to remove partner." }, { status: 500 });
  }
}
