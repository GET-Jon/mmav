import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { summarizePartsReadiness } from "@/lib/mindful-inventory/parts-readiness";

const allowedStatuses = new Set(["planned", "ready_to_schedule", "scheduled", "in_progress", "blocked", "complete", "cancelled"]);

export async function PATCH(request: Request, context: { params: Promise<{ workOrderId: string }> }) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { workOrderId } = await context.params;
    const body = await request.json();
    const requestedStatus = body.status === undefined ? null : String(body.status || "").trim();
    const performerKey = body.performerKey === undefined ? undefined : String(body.performerKey || "").trim();
    const locationProvided = Object.prototype.hasOwnProperty.call(body, "locationId");
    const resourceProvided = Object.prototype.hasOwnProperty.call(body, "resourceId");
    const locationId = locationProvided ? String(body.locationId || "").trim() || null : undefined;
    const resourceId = resourceProvided ? String(body.resourceId || "").trim() || null : undefined;
    const blockerReason = String(body.blockerReason || "").trim() || null;

    if (!requestedStatus && performerKey === undefined && !locationProvided && !resourceProvided) {
      return NextResponse.json({ error: "No Work Order change was provided." }, { status: 400 });
    }
    if (requestedStatus && !allowedStatuses.has(requestedStatus)) return NextResponse.json({ error: "Invalid Work Order status." }, { status: 400 });
    if (requestedStatus === "blocked" && !blockerReason) return NextResponse.json({ error: "Blocked Work Orders require a reason." }, { status: 400 });

    const { data: existing, error: existingError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .select("id,vehicle_id,status,actual_start_at,assigned_partner_id,assigned_user_id,location_id,resource_id,scheduled_start_at,scheduled_end_at")
      .eq("id", workOrderId)
      .single();
    if (existingError || !existing) return NextResponse.json({ error: "Work Order not found." }, { status: 404 });

    const { data: vehicle } = await access.supabase
      .from("mindful_inventory_vehicles")
      .select("id")
      .eq("id", existing.vehicle_id)
      .eq("company_id", access.company.companyId)
      .single();
    if (!vehicle) return NextResponse.json({ error: "Work Order is outside the current company." }, { status: 403 });

    if (requestedStatus === "in_progress") {
      const { data: partRows, error: partsError } = await access.supabase
        .from("mindful_inventory_work_order_parts")
        .select("work_order_id,status,eta_at")
        .eq("work_order_id", workOrderId);
      if (partsError) throw new Error(partsError.message);

      const parts = summarizePartsReadiness(partRows || []);
      if (!parts.readyForExecution) {
        const eta = parts.latestEtaAt
          ? ` Latest tracked ETA is ${new Date(parts.latestEtaAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`
          : "";
        return NextResponse.json(
          {
            error: `Waiting on parts: ${parts.pendingPartCount} tracked part${parts.pendingPartCount === 1 ? " is" : "s are"} not yet received.${eta}`,
            partsReadiness: parts.readiness,
            pendingPartCount: parts.pendingPartCount,
          },
          { status: 409 },
        );
      }
    }

    const patch: Record<string, unknown> = { updated_by: access.userId, updated_at: new Date().toISOString() };
    const metadata: Record<string, unknown> = {};

    if (performerKey !== undefined) {
      if (!performerKey || performerKey === "unassigned") {
        patch.assigned_partner_id = null;
        patch.assigned_user_id = null;
      } else if (performerKey.startsWith("partner:")) {
        const partnerId = performerKey.slice(8);
        const { data: partner } = await access.supabase
          .from("mindful_inventory_partners")
          .select("id,name")
          .eq("id", partnerId)
          .eq("company_id", access.company.companyId)
          .eq("active", true)
          .maybeSingle();
        if (!partner) return NextResponse.json({ error: "Selected partner is not available." }, { status: 400 });
        patch.assigned_partner_id = partnerId;
        patch.assigned_user_id = null;
        if (!locationProvided) {
          const { data: primary } = await access.supabase
            .from("mindful_inventory_partner_locations")
            .select("location_id")
            .eq("partner_id", partnerId)
            .eq("is_primary", true)
            .limit(1)
            .maybeSingle();
          if (primary?.location_id) {
            patch.location_id = primary.location_id;
            patch.resource_id = null;
          }
        }
        metadata.performerName = partner.name;
      } else if (performerKey.startsWith("user:")) {
        const userId = performerKey.slice(5);
        const { data: members } = await access.supabase.rpc("get_inventory_company_members", {
          requested_company_id: access.company.companyId,
        });
        const member = (members || []).find((row: { user_id: string }) => row.user_id === userId) as { display_name: string } | undefined;
        if (!member) return NextResponse.json({ error: "Selected internal performer is not a company member." }, { status: 400 });
        patch.assigned_user_id = userId;
        patch.assigned_partner_id = null;
        metadata.performerName = member.display_name;
      } else {
        return NextResponse.json({ error: "Invalid performer selection." }, { status: 400 });
      }
    }

    if (locationProvided) {
      if (locationId) {
        const { data: location } = await access.supabase
          .from("mindful_inventory_locations")
          .select("id,name")
          .eq("id", locationId)
          .eq("company_id", access.company.companyId)
          .eq("active", true)
          .maybeSingle();
        if (!location) return NextResponse.json({ error: "Selected location is not available." }, { status: 400 });
        patch.location_id = locationId;
        metadata.locationName = location.name;
        if (!resourceProvided) patch.resource_id = null;
      } else {
        patch.location_id = null;
        patch.resource_id = null;
      }
    }

    if (resourceProvided) {
      if (resourceId) {
        const effectiveLocationId = locationProvided
          ? locationId
          : (patch.location_id as string | null | undefined) ?? existing.location_id;
        if (!effectiveLocationId) return NextResponse.json({ error: "Choose a location before assigning a resource." }, { status: 400 });
        const { data: resource } = await access.supabase
          .from("mindful_inventory_resources")
          .select("id,name,location_id")
          .eq("id", resourceId)
          .eq("location_id", effectiveLocationId)
          .eq("active", true)
          .maybeSingle();
        if (!resource) return NextResponse.json({ error: "Selected resource does not belong to this location." }, { status: 400 });
        patch.resource_id = resourceId;
        metadata.resourceName = resource.name;
      } else {
        patch.resource_id = null;
      }
    }

    if (requestedStatus) {
      patch.status = requestedStatus;
      patch.blocker_reason = requestedStatus === "blocked" ? blockerReason : null;
      const now = new Date().toISOString();
      if (requestedStatus === "in_progress" && !existing.actual_start_at) patch.actual_start_at = now;
      if (requestedStatus === "complete") {
        patch.actual_start_at = existing.actual_start_at || now;
        patch.actual_end_at = now;
      }
    }

    const effectiveStatus = requestedStatus || existing.status;
    if (
      (performerKey !== undefined || resourceProvided) &&
      existing.scheduled_start_at &&
      existing.scheduled_end_at &&
      !["complete", "cancelled"].includes(effectiveStatus)
    ) {
      const effectivePartnerId = Object.prototype.hasOwnProperty.call(patch, "assigned_partner_id")
        ? (patch.assigned_partner_id as string | null)
        : existing.assigned_partner_id;
      const effectiveUserId = Object.prototype.hasOwnProperty.call(patch, "assigned_user_id")
        ? (patch.assigned_user_id as string | null)
        : existing.assigned_user_id;
      const effectiveResourceId = Object.prototype.hasOwnProperty.call(patch, "resource_id")
        ? (patch.resource_id as string | null)
        : existing.resource_id;

      const checks: Array<{ field: string; id: string; label: string }> = [];
      if (performerKey !== undefined) {
        if (effectivePartnerId) checks.push({ field: "assigned_partner_id", id: effectivePartnerId, label: "partner" });
        if (effectiveUserId) checks.push({ field: "assigned_user_id", id: effectiveUserId, label: "team member" });
      }
      if (resourceProvided && effectiveResourceId) {
        checks.push({ field: "resource_id", id: effectiveResourceId, label: "resource" });
      }

      for (const check of checks) {
        const { data: conflicts, error: conflictError } = await access.supabase
          .from("mindful_inventory_work_orders")
          .select("id,title,scheduled_start_at,scheduled_end_at")
          .eq(check.field, check.id)
          .neq("id", workOrderId)
          .not("status", "in", '("complete","cancelled")')
          .lt("scheduled_start_at", existing.scheduled_end_at)
          .gt("scheduled_end_at", existing.scheduled_start_at)
          .limit(1);
        if (conflictError) throw new Error(conflictError.message);
        if (conflicts?.length) {
          const conflict = conflicts[0];
          return NextResponse.json(
            { error: `Assignment conflict: this ${check.label} is already booked for “${conflict.title}” during this Work Order's scheduled time.` },
            { status: 409 },
          );
        }
      }
    }

    const { data: updated, error: updateError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .update(patch)
      .eq("id", workOrderId)
      .select("id,status,vehicle_id,assigned_partner_id,assigned_user_id,location_id,resource_id,actual_start_at,actual_end_at")
      .single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    if (performerKey !== undefined || locationProvided || resourceProvided) {
      await access.supabase.from("mindful_inventory_history").insert({
        company_id: access.company.companyId,
        vehicle_id: existing.vehicle_id,
        event_type: "work_order_assignment_changed",
        entity_type: "work_order",
        entity_id: workOrderId,
        actor_user_id: access.userId,
        summary: "Work Order execution assignment updated.",
        metadata: {
          previousPartnerId: existing.assigned_partner_id,
          previousUserId: existing.assigned_user_id,
          previousLocationId: existing.location_id,
          previousResourceId: existing.resource_id,
          ...metadata,
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
      const { count } = await access.supabase
        .from("mindful_inventory_work_orders")
        .select("id", { count: "exact", head: true })
        .eq("vehicle_id", existing.vehicle_id)
        .not("status", "in", '("complete","cancelled")');
      if ((count || 0) === 0) {
        await access.supabase
          .from("mindful_inventory_vehicles")
          .update({
            phase: "final_qc",
            next_action: "Complete Final QC",
            next_action_owner_user_id: access.userId,
            updated_by: access.userId,
            updated_at: new Date().toISOString(),
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
      resourceId: updated.resource_id,
      actualStartAt: updated.actual_start_at,
      actualEndAt: updated.actual_end_at,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update Work Order." }, { status: 500 });
  }
}
