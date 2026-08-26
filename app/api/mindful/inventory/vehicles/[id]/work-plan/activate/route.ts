import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventoryCarPlanData } from "@/lib/mindful-inventory/car-plan";
import {
  getInventoryPerformerOptions,
  scorePerformerForWork,
  type InventoryPerformerOption,
} from "@/lib/mindful-inventory/performers";
import { defaultPartnerStandardHours, type PartnerStandardHours } from "@/lib/admin/partners";

const COMPANY_TIME_ZONE = "America/New_York";
const dayKeyByWeekday: Record<string, keyof PartnerStandardHours> = {
  Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat", Sun: "sun",
};

type PartnerScheduling = {
  id: string;
  name: string;
  schedulingMode: string;
  standardHours: PartnerStandardHours;
};

function zonedParts(date: Date, timeZone = COMPANY_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return {
    year: Number(get("year")), month: Number(get("month")), day: Number(get("day")),
    hour: Number(get("hour")), minute: Number(get("minute")), weekday: get("weekday"),
  };
}

function localToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone = COMPANY_TIME_ZONE) {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  for (let index = 0; index < 3; index += 1) {
    const actual = zonedParts(guess, timeZone);
    const desiredStamp = Date.UTC(year, month - 1, day, hour, minute);
    const actualStamp = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    guess = new Date(guess.getTime() + desiredStamp - actualStamp);
  }
  return guess;
}

function parseClock(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return { hour: Number.isFinite(hour) ? hour : 9, minute: Number.isFinite(minute) ? minute : 0 };
}

function normalizeHours(value: unknown): PartnerStandardHours {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const next = structuredClone(defaultPartnerStandardHours);
  (Object.keys(next) as Array<keyof PartnerStandardHours>).forEach((day) => {
    const row = source[day] && typeof source[day] === "object" ? source[day] as Record<string, unknown> : {};
    next[day] = {
      enabled: typeof row.enabled === "boolean" ? row.enabled : next[day].enabled,
      start: typeof row.start === "string" ? row.start : next[day].start,
      end: typeof row.end === "string" ? row.end : next[day].end,
    };
  });
  return next;
}

function nextSlotWithinHours(after: Date, durationMinutes: number, hours: PartnerStandardHours) {
  let probe = new Date(after);
  for (let guard = 0; guard < 21; guard += 1) {
    const local = zonedParts(probe);
    const day = hours[dayKeyByWeekday[local.weekday]];
    if (day?.enabled) {
      const open = parseClock(day.start);
      const close = parseClock(day.end);
      const openAt = localToUtc(local.year, local.month, local.day, open.hour, open.minute);
      const closeAt = localToUtc(local.year, local.month, local.day, close.hour, close.minute);
      let candidate = new Date(Math.max(probe.getTime(), openAt.getTime()));
      const localCandidate = zonedParts(candidate);
      const rounded = Math.ceil(localCandidate.minute / 30) * 30;
      candidate = rounded >= 60
        ? localToUtc(localCandidate.year, localCandidate.month, localCandidate.day, localCandidate.hour + 1, 0)
        : localToUtc(localCandidate.year, localCandidate.month, localCandidate.day, localCandidate.hour, rounded);
      if (candidate.getTime() + durationMinutes * 60_000 <= closeAt.getTime()) return candidate;
    }
    const tomorrowNoon = new Date(Date.UTC(local.year, local.month - 1, local.day + 1, 12));
    const tomorrow = zonedParts(tomorrowNoon);
    probe = localToUtc(tomorrow.year, tomorrow.month, tomorrow.day, 0, 0);
  }
  return after;
}

function tokens(value: string) {
  return new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((v) => v.length >= 3));
}

function choosePartner(
  work: { title: string; category: string },
  explicitPartnerId: string | null,
  performers: InventoryPerformerOption[],
  partnerSettings: Map<string, PartnerScheduling>,
  cursor: Date,
  durationMinutes: number,
) {
  if (explicitPartnerId) return explicitPartnerId;
  const ranked = performers
    .filter((performer) => performer.type === "partner")
    .map((performer) => {
      const score = scorePerformerForWork(work, performer);
      const settings = partnerSettings.get(performer.id);
      const earliest = settings
        ? nextSlotWithinHours(cursor, durationMinutes, settings.standardHours).getTime()
        : Number.MAX_SAFE_INTEGER;
      return { performer, score, earliest };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.earliest - b.earliest || a.performer.displayName.localeCompare(b.performer.displayName));
  return ranked[0]?.performer.id || null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });

    const { id } = await context.params;
    const vehicleId = String(id || "").trim();
    const body = await request.json().catch(() => ({}));
    const current = await getInventoryCarPlanData(access.supabase, vehicleId);
    const requestedVersionId = String(body.planVersionId || current.currentDraftVersion?.id || "").trim();
    if (!requestedVersionId) return NextResponse.json({ error: "No Preliminary Work Plan is available to activate." }, { status: 400 });

    const { data, error } = await access.supabase.rpc("activate_inventory_work_plan", {
      requested_vehicle_id: vehicleId,
      requested_plan_version_id: requestedVersionId,
      requested_company_id: access.company.companyId,
      requesting_user_id: access.userId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const result = Array.isArray(data) ? data[0] : data;

    const [workResult, itemResult, performerOptions, partnerResult] = await Promise.all([
      access.supabase
        .from("mindful_inventory_work_orders")
        .select("id,plan_item_id,title,description,category,estimated_elapsed_minutes,estimated_duration_minutes,assigned_partner_id,location_id,resource_id,status")
        .eq("vehicle_id", vehicleId)
        .eq("plan_version_id", requestedVersionId),
      access.supabase
        .from("mindful_inventory_plan_items")
        .select("id,sequence_order,suggested_partner_id")
        .eq("plan_version_id", requestedVersionId)
        .eq("decision", "approved")
        .order("sequence_order", { ascending: true }),
      getInventoryPerformerOptions(access.supabase, access.company.companyId),
      access.supabase
        .from("mindful_inventory_partners")
        .select("id,name,scheduling_mode,standard_hours")
        .eq("company_id", access.company.companyId)
        .eq("active", true),
    ]);
    if (workResult.error) throw new Error(workResult.error.message);
    if (itemResult.error) throw new Error(itemResult.error.message);
    if (partnerResult.error) throw new Error(partnerResult.error.message);

    const partnerSettings = new Map<string, PartnerScheduling>(
      (partnerResult.data || []).map((partner) => [partner.id, {
        id: partner.id,
        name: partner.name,
        schedulingMode: partner.scheduling_mode || "manager_scheduled",
        standardHours: normalizeHours(partner.standard_hours),
      }]),
    );
    const workByPlanItem = new Map((workResult.data || []).map((row) => [row.plan_item_id, row]));
    const primaryLocationByPartner = new Map<string, string | null>();
    const resourceCache = new Map<string, Array<{ id: string; name: string; resource_type: string }>>();
    const externalPartnerCursor = new Map<string, Date>();

    let cursor = nextSlotWithinHours(new Date(), 60, defaultPartnerStandardHours);
    let suggestedCount = 0;
    let coordinationCount = 0;

    for (const item of itemResult.data || []) {
      const work = workByPlanItem.get(item.id);
      if (!work || work.status === "complete" || work.status === "cancelled") continue;

      const durationMinutes = Math.max(60, Number(work.estimated_elapsed_minutes ?? work.estimated_duration_minutes ?? 60) || 60);
      const explicitPartnerId = item.suggested_partner_id || work.assigned_partner_id || null;
      const partnerId = choosePartner(
        { title: work.title, category: work.category },
        explicitPartnerId,
        performerOptions,
        partnerSettings,
        cursor,
        durationMinutes,
      );
      const settings = partnerId ? partnerSettings.get(partnerId) || null : null;

      let locationId = work.location_id || null;
      let resourceId = work.resource_id || null;

      if (partnerId && !locationId) {
        if (!primaryLocationByPartner.has(partnerId)) {
          const { data: primary, error: primaryError } = await access.supabase
            .from("mindful_inventory_partner_locations")
            .select("location_id")
            .eq("partner_id", partnerId)
            .eq("is_primary", true)
            .limit(1)
            .maybeSingle();
          if (primaryError) throw new Error(primaryError.message);
          primaryLocationByPartner.set(partnerId, primary?.location_id || null);
        }
        locationId = primaryLocationByPartner.get(partnerId) || null;
      }

      if (locationId && !resourceId) {
        if (!resourceCache.has(locationId)) {
          const { data: resources, error: resourceError } = await access.supabase
            .from("mindful_inventory_resources")
            .select("id,name,resource_type")
            .eq("location_id", locationId)
            .eq("active", true)
            .order("name", { ascending: true });
          if (resourceError) throw new Error(resourceError.message);
          resourceCache.set(locationId, resources || []);
        }
        const resources = resourceCache.get(locationId) || [];
        const workTokens = tokens(`${work.category} ${work.title} ${work.description || ""}`);
        const ranked = resources.map((resource) => {
          const resourceTokens = tokens(`${resource.resource_type} ${resource.name}`);
          let score = 0;
          resourceTokens.forEach((token) => { if (workTokens.has(token)) score += 2; });
          if (resource.resource_type === "bay" && ["mechanical", "exhaust"].some((token) => workTokens.has(token))) score += 2;
          return { resource, score };
        }).sort((a, b) => b.score - a.score || a.resource.name.localeCompare(b.resource.name));
        if (ranked[0]?.score > 0 || resources.length === 1) resourceId = ranked[0]?.resource.id || null;
      }

      const schedulingMode = settings?.schedulingMode || "manager_scheduled";
      const partnerHours = settings?.standardHours || defaultPartnerStandardHours;
      const externallyControlled = partnerId && ["coordination_required", "partner_self_scheduling"].includes(schedulingMode);

      if (externallyControlled && partnerId) {
        const proposalCursor = externalPartnerCursor.get(partnerId) || cursor;
        let proposedStart = nextSlotWithinHours(proposalCursor, durationMinutes, partnerHours);

        for (let guard = 0; guard < 40; guard += 1) {
          const proposedEnd = new Date(proposedStart.getTime() + durationMinutes * 60_000);
          const { data: conflicts, error: conflictError } = await access.supabase
            .from("mindful_inventory_work_orders")
            .select("scheduled_end_at,proposed_end_at")
            .eq("assigned_partner_id", partnerId)
            .neq("id", work.id)
            .not("status", "in", '("complete","cancelled")')
            .or(`and(scheduled_start_at.lt.${proposedEnd.toISOString()},scheduled_end_at.gt.${proposedStart.toISOString()}),and(proposed_start_at.lt.${proposedEnd.toISOString()},proposed_end_at.gt.${proposedStart.toISOString()})`)
            .limit(1);
          if (conflictError) throw new Error(conflictError.message);
          const conflict = conflicts?.[0];
          if (!conflict) break;
          const conflictEnd = conflict.scheduled_end_at || conflict.proposed_end_at;
          if (!conflictEnd) break;
          proposedStart = nextSlotWithinHours(new Date(conflictEnd), durationMinutes, partnerHours);
        }

        const proposedEnd = new Date(proposedStart.getTime() + durationMinutes * 60_000);
        const { error: coordinationError } = await access.supabase
          .from("mindful_inventory_work_orders")
          .update({
            assigned_partner_id: partnerId,
            assigned_user_id: null,
            location_id: locationId,
            resource_id: resourceId,
            scheduled_start_at: null,
            scheduled_end_at: null,
            proposed_start_at: proposedStart.toISOString(),
            proposed_end_at: proposedEnd.toISOString(),
            partner_confirmation_status: "awaiting_partner",
            schedule_source: "suggested",
            status: "ready_to_schedule",
            updated_by: access.userId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", work.id);
        if (coordinationError) throw new Error(coordinationError.message);
        externalPartnerCursor.set(partnerId, proposedEnd);
        coordinationCount += 1;
        continue;
      }

      cursor = nextSlotWithinHours(cursor, durationMinutes, partnerHours);
      for (let guard = 0; guard < 40; guard += 1) {
        const proposedEnd = new Date(cursor.getTime() + durationMinutes * 60_000);
        const conflictFields = [
          partnerId ? { field: "assigned_partner_id", id: partnerId } : null,
          resourceId ? { field: "resource_id", id: resourceId } : null,
        ].filter(Boolean) as Array<{ field: string; id: string }>;
        let conflictEnd: string | null = null;
        for (const conflictField of conflictFields) {
          const { data: conflicts, error: conflictError } = await access.supabase
            .from("mindful_inventory_work_orders")
            .select("scheduled_end_at")
            .eq(conflictField.field, conflictField.id)
            .neq("id", work.id)
            .not("status", "in", '("complete","cancelled")')
            .lt("scheduled_start_at", proposedEnd.toISOString())
            .gt("scheduled_end_at", cursor.toISOString())
            .order("scheduled_end_at", { ascending: false })
            .limit(1);
          if (conflictError) throw new Error(conflictError.message);
          if (conflicts?.[0]?.scheduled_end_at && (!conflictEnd || conflicts[0].scheduled_end_at > conflictEnd)) conflictEnd = conflicts[0].scheduled_end_at;
        }
        if (!conflictEnd) break;
        cursor = nextSlotWithinHours(new Date(conflictEnd), durationMinutes, partnerHours);
      }

      const end = new Date(cursor.getTime() + durationMinutes * 60_000);
      const { error: scheduleError } = await access.supabase
        .from("mindful_inventory_work_orders")
        .update({
          assigned_partner_id: partnerId,
          assigned_user_id: null,
          location_id: locationId,
          resource_id: resourceId,
          scheduled_start_at: cursor.toISOString(),
          scheduled_end_at: end.toISOString(),
          proposed_start_at: null,
          proposed_end_at: null,
          partner_confirmation_status: partnerId ? "confirmed" : null,
          schedule_source: "suggested",
          status: "scheduled",
          updated_by: access.userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", work.id);
      if (scheduleError) throw new Error(scheduleError.message);
      suggestedCount += 1;
      cursor = nextSlotWithinHours(end, 60, partnerHours);
    }

    if (suggestedCount > 0 || coordinationCount > 0) {
      await access.supabase.from("mindful_inventory_history").insert({
        company_id: access.company.companyId,
        vehicle_id: vehicleId,
        event_type: "suggested_schedule_created",
        entity_type: "car_plan_version",
        entity_id: requestedVersionId,
        actor_user_id: access.userId,
        summary: "Execution plan prepared from capabilities, partner control, hours, locations, resources, and current bookings.",
        metadata: {
          suggestedWorkOrders: suggestedCount,
          awaitingPartnerConfirmation: coordinationCount,
          timeZone: COMPANY_TIME_ZONE,
        },
      });
    }

    return NextResponse.json({
      planVersionId: result?.returned_plan_version_id || requestedVersionId,
      workOrdersCreated: Number(result?.work_orders_created || 0),
      suggestedWorkOrders: suggestedCount,
      coordinationRequiredWorkOrders: coordinationCount,
      activated: Boolean(result?.activated),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to activate Work Plan." }, { status: 500 });
  }
}
