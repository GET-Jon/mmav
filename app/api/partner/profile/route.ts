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
      ? Array.from(new Set(body.capabilityIds.filter((id): id is string => typeof id === "string" && id.trim())))
      : [];

    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    if (!phone) return NextResponse.json({ error: "Phone is required." }, { status: 400 });
    if (!locationText) return NextResponse.json({ error: "General location is required." }, { status: 400 });
    if (!standardHours) return NextResponse.json({ error: "Availability hours are required." }, { status: 400 });

    const admin = createSupabaseAdminClient();
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

    if (capabilityIds.length) {
      const { error: insertError } = await admin
        .from("mindful_inventory_partner_capability_assignments")
        .insert(capabilityIds.map((capabilityId) => ({ partner_id: access.partner.id, capability_id: capabilityId })));
      if (insertError) throw new Error(insertError.message);
    }

    return NextResponse.json({ saved: true, firstConfirmation: !access.partner.profileConfirmedAt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Partner profile could not be saved." },
      { status: 500 },
    );
  }
}
