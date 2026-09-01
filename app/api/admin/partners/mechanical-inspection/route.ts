import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Inspection fee and duration must be non-negative numbers.");
  return parsed;
}

export async function PATCH(request: Request) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access || access.company.role !== "company_admin") {
      return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const partnerId = String(body.partnerId || "").trim();
    if (!partnerId) return NextResponse.json({ error: "Partner id is required." }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const updateRow = {
      mechanical_inspection_eligible: body.eligible === true,
      default_inspection_fee: optionalNumber(body.defaultInspectionFee),
      typical_inspection_duration_hours: optionalNumber(body.typicalInspectionDurationHours),
      updated_by: access.userId,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await admin
      .from("mindful_inventory_partners")
      .update(updateRow)
      .eq("id", partnerId)
      .eq("company_id", access.company.companyId)
      .select("id,name,mechanical_inspection_eligible,default_inspection_fee,typical_inspection_duration_hours")
      .single();
    if (error) throw new Error(error.message);

    await admin.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      event_type: "partner_mechanical_inspection_settings_updated",
      entity_type: "partner",
      entity_id: partnerId,
      actor_user_id: access.userId,
      summary: `${data.name} mechanical inspection eligibility updated.`,
      metadata: updateRow,
    });

    return NextResponse.json({
      partnerId: data.id,
      eligible: data.mechanical_inspection_eligible === true,
      defaultInspectionFee: data.default_inspection_fee,
      typicalInspectionDurationHours: data.typical_inspection_duration_hours,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update inspection eligibility." }, { status: 500 });
  }
}
