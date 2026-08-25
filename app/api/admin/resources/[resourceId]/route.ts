import { NextResponse } from "next/server";
import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

export async function PATCH(request: Request, context: { params: Promise<{ resourceId: string }> }) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access || access.company.role !== "company_admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    const { resourceId } = await context.params;
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Resource name is required." }, { status: 400 });

    const { data: resource, error: resourceError } = await access.supabase
      .from("mindful_inventory_resources")
      .select("id,location_id")
      .eq("id", resourceId)
      .single();
    if (resourceError || !resource) return NextResponse.json({ error: "Resource not found." }, { status: 404 });

    const { data: location } = await access.supabase
      .from("mindful_inventory_locations")
      .select("id")
      .eq("id", resource.location_id)
      .eq("company_id", access.company.companyId)
      .maybeSingle();
    if (!location) return NextResponse.json({ error: "Resource is outside the current company." }, { status: 403 });

    const { error } = await access.supabase
      .from("mindful_inventory_resources")
      .update({
        name,
        resource_type: String(body.resourceType || "other").trim() || "other",
        active: body.active !== false,
        notes: String(body.notes || "").trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", resourceId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ id: resourceId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update resource." }, { status: 500 });
  }
}
