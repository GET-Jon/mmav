import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

function capabilityCode(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export async function POST(request: Request) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access || access.company.role !== "company_admin") {
      return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Capability name is required." }, { status: 400 });
    if (name.length > 80) return NextResponse.json({ error: "Capability name must be 80 characters or fewer." }, { status: 400 });

    const code = capabilityCode(name);
    if (!code) return NextResponse.json({ error: "Capability name must contain letters or numbers." }, { status: 400 });

    const { data: existing, error: existingError } = await access.supabase
      .from("mindful_inventory_partner_capabilities")
      .select("id,name,active")
      .eq("company_id", access.company.companyId)
      .eq("code", code)
      .maybeSingle();
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

    if (existing) {
      if (!existing.active) {
        const { error: reactivateError } = await access.supabase
          .from("mindful_inventory_partner_capabilities")
          .update({ active: true, name, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (reactivateError) return NextResponse.json({ error: reactivateError.message }, { status: 500 });
      }
      return NextResponse.json({ id: existing.id, reused: true });
    }

    const { data, error } = await access.supabase
      .from("mindful_inventory_partner_capabilities")
      .insert({ company_id: access.company.companyId, code, name, active: true })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create capability." }, { status: 500 });
  }
}
