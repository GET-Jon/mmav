import { NextResponse } from "next/server";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

const allowedTypes = new Set(["mindful_facility", "partner", "auction", "storage", "transport", "other"]);

export async function POST(request: Request) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access || access.company.role !== "company_admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    const body = await request.json();
    const name = String(body.name || "").trim();
    const locationType = String(body.locationType || "other").trim();
    if (!name) return NextResponse.json({ error: "Location name is required." }, { status: 400 });
    if (!allowedTypes.has(locationType)) return NextResponse.json({ error: "Invalid location type." }, { status: 400 });

    const { data, error } = await access.supabase
      .from("mindful_inventory_locations")
      .insert({
        company_id: access.company.companyId,
        name,
        location_type: locationType,
        address_line_1: String(body.addressLine1 || "").trim() || null,
        address_line_2: String(body.addressLine2 || "").trim() || null,
        city: String(body.city || "").trim() || null,
        state: String(body.state || "").trim() || null,
        postal_code: String(body.postalCode || "").trim() || null,
        country: String(body.country || "US").trim() || "US",
        notes: String(body.notes || "").trim() || null,
        active: body.active !== false,
        created_by: access.userId,
        updated_by: access.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ id: data.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create location." }, { status: 500 });
  }
}
