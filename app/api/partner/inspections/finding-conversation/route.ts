import { NextResponse } from "next/server";

import { requirePartnerPortalAccess } from "@/lib/partner-portal/access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const access = await requirePartnerPortalAccess();
  const findingId = new URL(request.url).searchParams.get("findingId")?.trim();
  if (!findingId) return NextResponse.json({ error: "findingId is required." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: finding, error: findingError } = await admin
    .from("mindful_inventory_findings")
    .select("id,vehicle_id")
    .eq("id", findingId)
    .maybeSingle();

  if (findingError) return NextResponse.json({ error: findingError.message }, { status: 500 });
  if (!finding) return NextResponse.json({ error: "Finding not found." }, { status: 404 });

  const { data: inspection, error: inspectionError } = await admin
    .from("mindful_inventory_inspections")
    .select("id")
    .eq("vehicle_id", finding.vehicle_id)
    .eq("inspection_type", "mechanical")
    .eq("performed_by_partner_id", access.partner.id)
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle();

  if (inspectionError) return NextResponse.json({ error: inspectionError.message }, { status: 500 });
  if (!inspection) return NextResponse.json({ error: "This finding is not assigned to your inspection account." }, { status: 403 });

  const { data, error } = await admin
    .from("mindful_inventory_history")
    .select("id,event_type,metadata,created_at")
    .eq("entity_type", "finding")
    .eq("entity_id", findingId)
    .in("event_type", [
      "mechanical_finding_clarification_requested",
      "mechanical_finding_clarification_answered",
    ])
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const messages = (data || []).flatMap((row) => {
    const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {};
    const message = String(metadata.notes ?? metadata.message ?? "").trim();
    if (!message) return [];
    return [{
      id: row.id,
      role: row.event_type === "mechanical_finding_clarification_requested" ? "owner" : "partner",
      message,
      createdAt: row.created_at,
    }];
  });

  return NextResponse.json({ messages }, { headers: { "Cache-Control": "no-store" } });
}
