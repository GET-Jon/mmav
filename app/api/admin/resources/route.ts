import { NextResponse } from "next/server";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

export async function POST(request: Request) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access || access.company.role !== "company_admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    const body = await request.json();
    const locationId = String(body.locationId || "").trim();
    const name = String(body.name || "").trim();
    if (!locationId || !name) return NextResponse.json({ error: "Location and resource name are required." }, { status: 400 });

    const { data: location } = await access.supabase
      .from("mindful_inventory_locations")
      .select("id")
      .eq("id", locationId)
      .eq("company_id", access.company.companyId)
      .maybeSingle();
    if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

    const { data, error } = await access.supabase
      .from("mindful_inventory_resources")
      .insert({
        location_id: locationId,
        name,
        resource_type: String(body.resourceType || "other").trim() || "other",
        active: body.active !== false,
        notes: String(body.notes || "").trim() || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ id: data.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create resource." }, { status: 500 });
  }
}
