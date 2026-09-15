import { NextResponse } from "next/server";

import { getPartnerPortalAccess } from "@/lib/partner-portal/access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

export async function POST(request: Request) {
  try {
    const access = await getPartnerPortalAccess();
    if (!access) return NextResponse.json({ error: "Partner portal access required." }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const name = clean(body.name);
    const addressLine1 = clean(body.addressLine1);
    const addressLine2 = clean(body.addressLine2);
    const city = clean(body.city);
    const state = clean(body.state);
    const postalCode = clean(body.postalCode);

    if (!name) return NextResponse.json({ error: "Location name is required." }, { status: 400 });
    if (!addressLine1) return NextResponse.json({ error: "Street address is required." }, { status: 400 });
    if (!city) return NextResponse.json({ error: "City is required." }, { status: 400 });
    if (!state) return NextResponse.json({ error: "State is required." }, { status: 400 });
    if (!postalCode) return NextResponse.json({ error: "ZIP code is required." }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const now = new Date().toISOString();

    const { data: created, error: createError } = await admin
      .from("mindful_inventory_locations")
      .insert({
        company_id: access.partner.companyId,
        name,
        location_type: "partner",
        address_line_1: addressLine1,
        address_line_2: addressLine2,
        city,
        state,
        postal_code: postalCode,
        active: true,
        notes: `Partner-added default work location for ${access.partner.name}.`,
        created_by: access.userId,
        updated_by: access.userId,
        created_at: now,
        updated_at: now,
      })
      .select("id,name,address_line_1,address_line_2,city,state,postal_code")
      .single();
    if (createError || !created) throw new Error(createError?.message || "Could not create the work location.");

    const { error: clearError } = await admin
      .from("mindful_inventory_partner_locations")
      .update({ is_primary: false })
      .eq("partner_id", access.partner.id)
      .eq("is_primary", true);
    if (clearError) throw new Error(clearError.message);

    const { error: linkError } = await admin
      .from("mindful_inventory_partner_locations")
      .upsert({
        partner_id: access.partner.id,
        location_id: created.id,
        is_primary: true,
        can_work_mobile: false,
      }, { onConflict: "partner_id,location_id" });
    if (linkError) throw new Error(linkError.message);

    const address = [created.address_line_1, created.address_line_2, created.city, created.state, created.postal_code].filter(Boolean).join(", ");
    return NextResponse.json({
      location: { id: created.id, name: created.name, address: address || null },
      primaryLocationId: created.id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Default work location could not be added." },
      { status: 500 },
    );
  }
}
