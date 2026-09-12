import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth";

export async function POST(request: Request, context: { params: Promise<{ workOrderId: string }> }) {
  try {
    const authClient = await createSupabaseServerAuthClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { workOrderId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const kind = String(body.kind || "");
    const action = String(body.action || "");
    const note = body.note == null ? null : String(body.note).trim().slice(0, 1000);
    const locationId = body.locationId == null ? null : String(body.locationId).trim() || null;
    const newLocation = body.newLocation == null ? null : String(body.newLocation).trim().slice(0, 1000) || null;

    if (!["location", "parts"].includes(kind) || !["confirm", "adjust", "set"].includes(action)) {
      return NextResponse.json({ error: "Invalid logistics action." }, { status: 400 });
    }
    if (action === "set" && kind !== "location") {
      return NextResponse.json({ error: "Only a work location can be set directly." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: work, error: workError } = await admin
      .from("mindful_inventory_work_orders")
      .select("id,vehicle_id,location_id,assigned_partner_id,status")
      .eq("id", workOrderId)
      .maybeSingle();
    if (workError) throw new Error(workError.message);
    if (!work?.assigned_partner_id) return NextResponse.json({ error: "Assigned Work Order not found." }, { status: 404 });
    if (["complete", "cancelled"].includes(work.status)) return NextResponse.json({ error: "This Work Order is closed." }, { status: 409 });

    const { data: partner, error: partnerError } = await admin
      .from("mindful_inventory_partners")
      .select("id,company_id,user_id,active")
      .eq("id", work.assigned_partner_id)
      .maybeSingle();
    if (partnerError) throw new Error(partnerError.message);
    if (!partner || !partner.active || partner.user_id !== user.id) {
      return NextResponse.json({ error: "You are not the assigned partner for this Work Order." }, { status: 403 });
    }

    if (action === "adjust" && !note) {
      return NextResponse.json({ error: kind === "location" ? "Tell us what location needs to change." : "Tell us what is wrong with the parts." }, { status: 400 });
    }

    const now = new Date().toISOString();
    let patch: Record<string, unknown>;
    let responseLocation: string | null = null;
    let newLocationCandidate = false;

    if (kind === "location") {
      if (action === "set") {
        if ((locationId && newLocation) || (!locationId && !newLocation)) {
          return NextResponse.json({ error: "Choose a saved location or enter one new location." }, { status: 400 });
        }

        if (locationId) {
          const { data: savedLocation, error: locationError } = await admin
            .from("mindful_inventory_locations")
            .select("id,name")
            .eq("id", locationId)
            .eq("company_id", partner.company_id)
            .eq("active", true)
            .maybeSingle();
          if (locationError) throw new Error(locationError.message);
          if (!savedLocation) return NextResponse.json({ error: "That saved location is not available." }, { status: 404 });

          responseLocation = savedLocation.name;
          patch = {
            location_id: savedLocation.id,
            partner_location_confirmation_status: "confirmed",
            partner_location_request: null,
            updated_at: now,
            updated_by: user.id,
          };
        } else {
          responseLocation = newLocation;
          newLocationCandidate = true;
          patch = {
            location_id: null,
            partner_location_confirmation_status: "confirmed",
            partner_location_request: newLocation,
            updated_at: now,
            updated_by: user.id,
          };
        }
      } else {
        patch = {
          partner_location_confirmation_status: action === "confirm" ? "confirmed" : "adjustment_requested",
          partner_location_request: action === "adjust" ? note : null,
          updated_at: now,
          updated_by: user.id,
        };
      }
    } else {
      patch = {
        partner_parts_confirmation_status: action === "confirm" ? "confirmed" : "issue_reported",
        partner_parts_note: action === "adjust" ? note : null,
        updated_at: now,
        updated_by: user.id,
      };
    }

    const { error: updateError } = await admin
      .from("mindful_inventory_work_orders")
      .update(patch)
      .eq("id", workOrderId)
      .eq("assigned_partner_id", partner.id);
    if (updateError) throw new Error(updateError.message);

    if (newLocationCandidate && newLocation) {
      const { error: historyError } = await admin
        .from("mindful_inventory_history")
        .insert({
          company_id: partner.company_id,
          vehicle_id: work.vehicle_id,
          event_type: "partner_new_location_candidate",
          entity_type: "work_order",
          entity_id: work.id,
          actor_user_id: user.id,
          actor_partner_id: partner.id,
          summary: `Partner selected a new work location: ${newLocation}.`,
          metadata: {
            locationText: newLocation,
            reviewForSavedLocations: true,
          },
        });
      if (historyError) throw new Error(historyError.message);
    }

    return NextResponse.json({
      ok: true,
      kind,
      status: action === "confirm" || action === "set" ? "confirmed" : "adjustment_requested",
      location: responseLocation,
      newLocationCandidate,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update logistics confirmation." }, { status: 500 });
  }
}
