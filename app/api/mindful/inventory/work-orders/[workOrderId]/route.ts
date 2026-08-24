import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

const allowedStatuses = new Set(["planned", "ready_to_schedule", "scheduled", "in_progress", "blocked", "complete", "cancelled"]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workOrderId: string }> },
) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { workOrderId } = await context.params;
    const body = await request.json();
    const requestedStatus = body.status === undefined ? null : String(body.status || "").trim();
    const performerKey = body.performerKey === undefined ? null : String(body.performerKey || "").trim();
    const blockerReason = String(body.blockerReason || "").trim() || null;

    if (!requestedStatus && performerKey === null) {
      return NextResponse.json({ error: "No Work Order change was provided." }, { status: 400 });
    }
    if (requestedStatus && !allowedStatuses.has(requestedStatus)) {
      return NextResponse.json({ error: "Invalid Work Order status." }, { status: 400 });
    }
    if (requestedStatus === "blocked" && !blockerReason) {
      return NextResponse.json({ error: "Blocked Work Orders require a reason." }, { status: 400 });
    }

    const { data: existing, error: existingError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .select("id,vehicle_id,status,actual_start_at,assigned_partner_id,assigned_user_id,location_id")
      .eq("id", workOrderId)
      .single();

    if (existingError || !existing) return NextResponse.json({ error: "Work Order not found." }, { status: 404 });

    const { data: vehicle, error: vehicleError } = await access.supabase
      .from("mindful_inventory_vehicles")
      .select("id")
      .eq("id", existing.vehicle_id)
      .eq("company_id", access.company.companyId)
      .single();

    if (vehicleError || !vehicle) return NextResponse.json({ error: "Work Order is outside the current company." }, { status: 403 });

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      updated_by: access.userId,
      updated_at: now,
    };

    let performerSummary: string | null = null;
    let performerMetadata: Record<string, unknown> | null = null;

    if (performerKey !== null) {
      if (!performerKey || performerKey === "unassigned") {
        patch.assigned_partner_id = null;
        patch.assigned_user_id = null;
        patch.location_id = null;
        performerSummary = "Work Order performer cleared.";
        performerMetadata = { performerType: null, performerId: null };
      } else if (performerKey.startsWith("partner:")) {
        const partnerId = performerKey.slice("partner:".length);
        const { data: partner, error: partnerError } = await access.supabase
          .from("mindful_inventory_partners")
          .select("id,name,company_name")
          .eq("id", partnerId)
          .eq("company_id", access.company.companyId)
          .eq("active", true)
          .maybeSingle();

        if (partnerError) throw new Error(partnerError.message);
        if (!partner) return NextResponse.json({ error: "Selected partner is not available." }, { status: 400 });

        const { data: primaryLocation, error: locationError } = await access.supabase
          .from("mindful_inventory_partner_locations")
          .select("location_id")
          .eq("partner_id", partnerId)
          .eq("is_primary", true)
          .limit(1)
          .maybeSingle();

        if (locationError) throw new Error(locationError.message);

        patch.assigned_partner_id = partnerId;
        patch.assigned_user_id = null;
        patch.location_id = primaryLocation?.location_id || null;
        performerSummary = `Work Order assigned to ${partner.name}.`;
        performerMetadata = {
          performerType: "partner",
          performerId: partnerId,
          performerName: partner.name,
          locationId: primaryLocation?.location_id || null,
        };
      } else if (performerKey.startsWith("user:")) {
        const userId = performerKey.slice("user:".length);
        const { data: members, error: membersError } = await access.supabase.rpc("get_inventory_company_members", {
          requested_company_id: access.company.companyId,
        });

        if (membersError) throw new Error(membersError.message);
        const member = (members || []).find((row: { user_id: string }) => row.user_id === userId) as
          | { user_id: string; display_name: string }
          | undefined;
        if (!member) return NextResponse.json({ error: "Selected internal performer is not a company member." }, { status: 400 });

        patch.assigned_user_id = userId;
        patch.assigned_partner_id = null;
        performerSummary = `Work Order assigned to ${member.display_name}.`;
        performerMetadata = {
          performerType: "internal",
          performerId: userId,
          performerName: member.display_name,
        };
      } else {
        return NextResponse.json({ error: "Invalid performer selection." }, { status: 400 });
      }
    }

    if (requestedStatus) {
      patch.status = requestedStatus;
      patch.blocker_reason = requestedStatus === "blocked" ? blockerReason : null;
      if (requestedStatus === "in_progress" && !existing.actual_start_at) patch.actual_start_at = now;
      if (requestedStatus === "complete") {
        patch.actual_start_at = existing.actual_start_at || now;
        patch.actual_end_at = now;
      }
    }

    const { data: updated, error: updateError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .update(patch)
      .eq("id", workOrderId)
      .select("id,status,vehicle_id,assigned_partner_id,assigned_user_id,location_id")
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    if (performerSummary) {
      await access.supabase.from("mindful_inventory_history").insert({
        company_id: access.company.companyId,
        vehicle_id: existing.vehicle_id,
        event_type: "work_order_assignment_changed",
        entity_type: "work_order",
        entity_id: workOrderId,
        actor_user_id: access.userId,
        summary: performerSummary,
        metadata: {
          previousPartnerId: existing.assigned_partner_id,
          previousUserId: existing.assigned_user_id,
          previousLocationId: existing.location_id,
          ...performerMetadata,
        },
      });
    }

    if (requestedStatus) {
      await access.supabase.from("mindful_inventory_history").insert({
        company_id: access.company.companyId,
        vehicle_id: existing.vehicle_id,
        event_type: requestedStatus === "complete" ? "work_order_completed" : "work_order_status_changed",
        entity_type: "work_order",
        entity_id: workOrderId,
        actor_user_id: access.userId,
        summary: requestedStatus === "complete" ? "Work Order completed." : `Work Order moved to ${requestedStatus.replaceAll("_", " ")}.`,
        metadata: { previousStatus: existing.status, status: requestedStatus },
      });
    }

    if (requestedStatus === "complete" || requestedStatus === "cancelled") {
      const { count, error: remainingError } = await access.supabase
        .from("mindful_inventory_work_orders")
        .select("id", { count: "exact", head: true })
        .eq("vehicle_id", existing.vehicle_id)
        .not("status", "in", '("complete","cancelled")');

      if (!remainingError && (count || 0) === 0) {
        await access.supabase
          .from("mindful_inventory_vehicles")
          .update({
            phase: "final_qc",
            next_action: "Complete Final QC",
            next_action_owner_user_id: access.userId,
            updated_by: access.userId,
            updated_at: now,
          })
          .eq("id", existing.vehicle_id)
          .eq("company_id", access.company.companyId);
      }
    }

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      assignedPartnerId: updated.assigned_partner_id,
      assignedUserId: updated.assigned_user_id,
      locationId: updated.location_id,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update Work Order." }, { status: 500 });
  }
}
