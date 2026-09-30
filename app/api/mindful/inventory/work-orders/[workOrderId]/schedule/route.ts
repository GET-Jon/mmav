import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { summarizePartsReadiness } from "@/lib/mindful-inventory/parts-readiness";

const PARTS_ETA_BUFFER_MINUTES = 120;

function parseDateTime(value: unknown) {
  const clean = String(value ?? "").trim();
  if (!clean) return null;
  const date = new Date(clean);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameInstant(value: string | null | undefined, date: Date) {
  if (!value) return false;
  return new Date(value).getTime() === date.getTime();
}

function localParts(date: Date, offsetMinutes: number) {
  const shifted = new Date(date.getTime() - offsetMinutes * 60_000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate(), weekday: shifted.getUTCDay(), hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() };
}

function fromLocal(year: number, month: number, day: number, hour: number, minute: number, offsetMinutes: number) {
  return new Date(Date.UTC(year, month, day, hour, minute) + offsetMinutes * 60_000);
}

function laborSegments(startValue: Date, laborMinutes: number, offsetMinutes: number) {
  let remaining = Math.max(1, Math.round(laborMinutes));
  let cursor = new Date(startValue);
  const segments: Array<{ start: Date; end: Date }> = [];
  let guard = 0;

  while (remaining > 0 && guard < 30) {
    guard += 1;
    let p = localParts(cursor, offsetMinutes);
    if (p.weekday === 0 || p.weekday === 6 || p.hour >= 17) {
      const daysToAdd = p.weekday === 5 ? 3 : p.weekday === 6 ? 2 : 1;
      cursor = fromLocal(p.year, p.month, p.day + daysToAdd, 8, 0, offsetMinutes);
      continue;
    }
    if (p.hour < 8) {
      cursor = fromLocal(p.year, p.month, p.day, 8, 0, offsetMinutes);
      p = localParts(cursor, offsetMinutes);
    }
    const available = Math.max(0, 17 * 60 - (p.hour * 60 + p.minute));
    if (!available) {
      cursor = fromLocal(p.year, p.month, p.day + 1, 8, 0, offsetMinutes);
      continue;
    }
    const used = Math.min(remaining, available);
    const end = new Date(cursor.getTime() + used * 60_000);
    segments.push({ start: new Date(cursor), end });
    remaining -= used;
    cursor = fromLocal(p.year, p.month, p.day + 1, 8, 0, offsetMinutes);
  }

  return remaining > 0 ? [] : segments;
}

export async function PATCH(request: Request, context: { params: Promise<{ workOrderId: string }> }) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { workOrderId } = await context.params;
    const body = await request.json();
    const start = parseDateTime(body.scheduledStartAt);
    if (!start) return NextResponse.json({ error: "A valid scheduled start is required." }, { status: 400 });
    const offsetRaw = Number(body.tzOffset ?? 0);
    const offsetMinutes = Number.isFinite(offsetRaw) ? Math.max(-840, Math.min(840, offsetRaw)) : 0;

    const { data: existing, error: existingError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .select("id,vehicle_id,status,estimated_labor_minutes,estimated_elapsed_minutes,estimated_duration_minutes,assigned_partner_id,assigned_user_id,location_id,resource_id,parts_review_status,partner_estimate_status,partner_confirmation_status,partner_parts_confirmation_status,scheduled_start_at,scheduled_end_at,proposed_start_at,proposed_end_at")
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

    const { data: partRows, error: partsError } = await access.supabase
      .from("mindful_inventory_work_order_parts")
      .select("work_order_id,status,eta_at")
      .eq("work_order_id", workOrderId);
    if (partsError) throw new Error(partsError.message);
    const parts = summarizePartsReadiness(partRows || []);

    const laborRaw = Number(existing.estimated_labor_minutes ?? existing.estimated_duration_minutes ?? 60);
    const laborMinutes = Number.isFinite(laborRaw) && laborRaw > 0 ? laborRaw : 60;
    const elapsedRaw = Number(existing.estimated_elapsed_minutes ?? existing.estimated_duration_minutes ?? laborMinutes);
    const elapsedMinutes = Number.isFinite(elapsedRaw) && elapsedRaw > 0 ? elapsedRaw : laborMinutes;
    const segments = laborSegments(start, laborMinutes, offsetMinutes);
    const end = segments.length ? segments[segments.length - 1].end : new Date(start.getTime() + laborMinutes * 60_000);

    const scheduleRisks: string[] = [];
    const riskKinds: string[] = [];
    if (existing.parts_review_status !== "resolved") {
      scheduleRisks.push("Parts review is not complete.");
      riskKinds.push("parts_review");
    }
    if (!existing.assigned_partner_id && !existing.assigned_user_id) {
      scheduleRisks.push("No assignee is selected yet.");
      riskKinds.push("assignee");
    }
    if (!existing.location_id) {
      scheduleRisks.push("The work location is still TBD.");
      riskKinds.push("location");
    }
    if (existing.assigned_partner_id && !["approved", "not_required"].includes(existing.partner_estimate_status || "")) {
      scheduleRisks.push("The partner labor quote is not approved yet.");
      riskKinds.push("quote");
    }

    const etaMs = parts.latestEtaAt ? new Date(parts.latestEtaAt).getTime() : null;
    const bufferedEtaMs = etaMs !== null && Number.isFinite(etaMs) ? etaMs + PARTS_ETA_BUFFER_MINUTES * 60_000 : null;
    if (existing.partner_parts_confirmation_status === "issue_reported") {
      scheduleRisks.push("The Partner has an open parts issue.");
      riskKinds.push("parts_issue");
    } else if (!parts.readyForExecution && bufferedEtaMs !== null && start.getTime() < bufferedEtaMs) {
      scheduleRisks.push("Required parts are expected after this slot once the 2 hr receiving buffer is applied.");
      riskKinds.push("parts_eta_conflict");
    } else if (!parts.readyForExecution && bufferedEtaMs === null) {
      scheduleRisks.push("A required part does not have a known ETA.");
      riskKinds.push("parts_eta_unknown");
    }

    const checks: Array<{ field: string; id: string; label: string }> = [];
    if (existing.assigned_partner_id) checks.push({ field: "assigned_partner_id", id: existing.assigned_partner_id, label: "partner" });
    if (existing.assigned_user_id) checks.push({ field: "assigned_user_id", id: existing.assigned_user_id, label: "team member" });
    if (existing.resource_id) checks.push({ field: "resource_id", id: existing.resource_id, label: "resource" });

    for (const check of checks) {
      const { data: conflicts, error: conflictError } = await access.supabase
        .from("mindful_inventory_work_orders")
        .select("id,title,scheduled_start_at,scheduled_end_at")
        .eq(check.field, check.id)
        .neq("id", workOrderId)
        .not("status", "in", '("complete","cancelled")')
        .lt("scheduled_start_at", end.toISOString())
        .gt("scheduled_end_at", start.toISOString())
        .limit(1);
      if (conflictError) throw new Error(conflictError.message);
      if (conflicts?.length) {
        scheduleRisks.push(`Schedule conflict: this ${check.label} is already assigned to “${conflicts[0].title}” during that time.`);
        riskKinds.push(`conflict_${check.field}`);
      }
    }

    const uniqueRisks = Array.from(new Set(scheduleRisks));
    const uniqueRiskKinds = Array.from(new Set(riskKinds));
    const overrideConflict = body.overrideConflict === true;
    const overrideReason = String(body.overrideReason || "").trim();
    if (uniqueRisks.length && !overrideConflict) {
      return NextResponse.json({
        error: "This time can still be used, but it has scheduling risks.",
        requiresOverride: true,
        warning: uniqueRisks.join(" "),
        risks: uniqueRisks,
        riskKinds: uniqueRiskKinds,
        partsReadiness: parts.readiness,
        pendingPartCount: parts.pendingPartCount,
        partsLatestEtaAt: parts.latestEtaAt,
        partsEtaBufferMinutes: PARTS_ETA_BUFFER_MINUTES,
      }, { status: 409 });
    }
    if (uniqueRisks.length && overrideConflict && !overrideReason) {
      return NextResponse.json({ error: "Add a brief reason for scheduling through the warning." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const isPartnerWork = Boolean(existing.assigned_partner_id);
    const acceptingPartnerProposal = isPartnerWork
      && existing.partner_confirmation_status === "awaiting_owner"
      && sameInstant(existing.proposed_start_at, start);

    const update = acceptingPartnerProposal
      ? {
          scheduled_start_at: start.toISOString(),
          scheduled_end_at: end.toISOString(),
          proposed_start_at: null,
          proposed_end_at: null,
          partner_confirmation_status: "confirmed",
          schedule_source: "partner",
          status: "scheduled",
          updated_by: access.userId,
          updated_at: now,
        }
      : isPartnerWork
        ? {
            proposed_start_at: start.toISOString(),
            proposed_end_at: end.toISOString(),
            scheduled_start_at: existing.scheduled_start_at,
            scheduled_end_at: existing.scheduled_end_at,
            partner_confirmation_status: "awaiting_partner",
            schedule_source: "suggested",
            status: existing.scheduled_start_at ? existing.status : "ready_to_schedule",
            updated_by: access.userId,
            updated_at: now,
          }
        : {
            scheduled_start_at: start.toISOString(),
            scheduled_end_at: end.toISOString(),
            proposed_start_at: null,
            proposed_end_at: null,
            partner_confirmation_status: null,
            schedule_source: "manual",
            status: existing.status === "complete" ? "complete" : "scheduled",
            updated_by: access.userId,
            updated_at: now,
          };

    const { data: updated, error: updateError } = await access.supabase
      .from("mindful_inventory_work_orders")
      .update(update)
      .eq("id", workOrderId)
      .select("id,scheduled_start_at,scheduled_end_at,proposed_start_at,proposed_end_at,partner_confirmation_status,status,schedule_source")
      .single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    await access.supabase.from("mindful_inventory_history").insert({
      company_id: access.company.companyId,
      vehicle_id: existing.vehicle_id,
      event_type: acceptingPartnerProposal ? "work_order_schedule_confirmed" : isPartnerWork ? "work_order_schedule_proposed" : "work_order_scheduled",
      entity_type: "work_order",
      entity_id: workOrderId,
      actor_user_id: access.userId,
      summary: acceptingPartnerProposal
        ? "Owner accepted the Partner-proposed work time."
        : isPartnerWork
          ? "Owner proposed a work time to the assigned Partner."
          : "Owner scheduled the Work Order.",
      metadata: {
        previousScheduledStartAt: existing.scheduled_start_at || null,
        previousScheduledEndAt: existing.scheduled_end_at || null,
        previousProposedStartAt: existing.proposed_start_at || null,
        previousProposedEndAt: existing.proposed_end_at || null,
        proposedStartAt: isPartnerWork && !acceptingPartnerProposal ? start.toISOString() : null,
        scheduledStartAt: !isPartnerWork || acceptingPartnerProposal ? start.toISOString() : existing.scheduled_start_at || null,
        endAt: end.toISOString(),
        laborMinutes,
        elapsedMinutes,
        scheduleRisks: uniqueRisks,
        scheduleRiskKinds: uniqueRiskKinds,
        override: uniqueRisks.length > 0,
        overrideReason: uniqueRisks.length ? overrideReason : null,
        partsEtaBufferMinutes: PARTS_ETA_BUFFER_MINUTES,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to schedule Work Order." }, { status: 500 });
  }
}
