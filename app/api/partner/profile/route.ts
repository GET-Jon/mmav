import { NextResponse } from "next/server";

import { getPartnerPortalAccess } from "@/lib/partner-portal/access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeHours(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const result: Record<string, { enabled: boolean; start: string; end: string }> = {};
  for (const day of days) {
    const row = source[day] && typeof source[day] === "object" ? source[day] as Record<string, unknown> : {};
    const start = typeof row.start === "string" && /^\d{2}:\d{2}$/.test(row.start) ? row.start : "09:00";
    const end = typeof row.end === "string" && /^\d{2}:\d{2}$/.test(row.end) ? row.end : "17:00";
    result[day] = { enabled: row.enabled === true, start, end };
  }
  return result;
}

function capabilityCode(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function normalizeNewCapabilities(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name || name.length > 80) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= 20) break;
  }
  return names;
}

export async function PUT(request: Request) {
  try {
    const access = await getPartnerPortalAccess();
    if (!access) return NextResponse.json({ error: "Partner portal access required." }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const name = clean(body.name);
    const phone = clean(body.phone);
    const locationText = clean(body.locationText);
    const companyName = clean(body.companyName);
    const standardHours = normalizeHours(body.standardHours);
    const capabilityIds = Array.isArray(body.capabilityIds)
      ? Array.from(new Set(body.capabilityIds.filter((id: unknown): id is string => typeof id === "string" && Boolean(id.trim()))))
      : [];
    const newCapabilityNames = normalizeNewCapabilities(body.newCapabilityNames);

    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    if (!phone) return NextResponse.json({ error: "Phone is required." }, { status: 400 });
    if (!locationText) return NextResponse.json({ error: "General location is required." }, { status: 400 });
    if (!standardHours) return NextResponse.json({ error: "Availability hours are required." }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const selectedCapabilityIds = new Set(capabilityIds);

    if (capabilityIds.length) {
      const { data: allowed, error: allowedError } = await admin
        .from("mindful_inventory_partner_capabilities")
        .select("id")
        .eq("company_id", access.partner.companyId)
        .eq("active", true)
        .in("id", capabilityIds);
      if (allowedError) throw new Error(allowedError.message);
      if ((allowed ?? []).length !== capabilityIds.length) {
        return NextResponse.json({ error: "One or more selected capabilities are not available." }, { status: 400 });
      }
    }

    for (const capabilityName of newCapabilityNames) {
      const code = capabilityCode(capabilityName);
      if (!code) continue;

      const { data: existing, error: existingError } = await admin
        .from("mindful_inventory_partner_capabilities")
        .select("id,active")
        .eq("company_id", access.partner.companyId)
        .eq("code", code)
        .maybeSingle();
      if (existingError) throw new Error(existingError.message);

      if (existing) {
        if (!existing.active) {
          const { error: reactivateError } = await admin
            .from("mindful_inventory_partner_capabilities")
            .update({ active: true, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
          if (reactivateError) throw new Error(reactivateError.message);
        }
        selectedCapabilityIds.add(existing.id);
        continue;
      }

      const { data: created, error: createError } = await admin
        .from("mindful_inventory_partner_capabilities")
        .insert({
          company_id: access.partner.companyId,
          code,
          name: capabilityName,
          active: true,
          source: "partner",
          created_by_partner_id: access.partner.id,
        })
        .select("id")
        .single();
      if (createError) throw new Error(createError.message);
      selectedCapabilityIds.add(created.id);
    }

    const now = new Date().toISOString();
    const { error: partnerError } = await admin
      .from("mindful_inventory_partners")
      .update({
        name,
        company_name: companyName,
        phone,
        location_text: locationText,
        standard_hours: standardHours,
        portal_profile_confirmed_at: access.partner.profileConfirmedAt || now,
        updated_by: access.userId,
        updated_at: now,
      })
      .eq("id", access.partner.id)
      .eq("user_id", access.userId)
      .eq("portal_access_enabled", true);
    if (partnerError) throw new Error(partnerError.message);

    const { error: deleteError } = await admin
      .from("mindful_inventory_partner_capability_assignments")
      .delete()
      .eq("partner_id", access.partner.id);
    if (deleteError) throw new Error(deleteError.message);

    const finalCapabilityIds = Array.from(selectedCapabilityIds);
    if (finalCapabilityIds.length) {
      const { error: insertError } = await admin
        .from("mindful_inventory_partner_capability_assignments")
        .insert(finalCapabilityIds.map((capabilityId) => ({ partner_id: access.partner.id, capability_id: capabilityId })));
      if (insertError) throw new Error(insertError.message);
    }

    return NextResponse.json({
      saved: true,
      firstConfirmation: !access.partner.profileConfirmedAt,
      addedCapabilities: newCapabilityNames.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Partner profile could not be saved." },
      { status: 500 },
    );
  }
}
