import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";
import { getInventoryCarPlanData } from "@/lib/mindful-inventory/car-plan";

const COMPANY_TIME_ZONE = "America/New_York";

function zonedParts(date: Date, timeZone = COMPANY_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")), hour: Number(get("hour")), minute: Number(get("minute")), weekday: get("weekday") };
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
function nextBusinessMorning(from = new Date()) {
  const local = zonedParts(from);
  let candidate = new Date(Date.UTC(local.year, local.month - 1, local.day + 1, 12));
  while (true) {
    const parts = zonedParts(candidate);
    if (parts.weekday !== "Sat" && parts.weekday !== "Sun") return localToUtc(parts.year, parts.month, parts.day, 9, 0);
    candidate = new Date(candidate.getTime() + 86_400_000);
  }
}
function nextBusinessSlot(after: Date) {
  const local = zonedParts(after);
  if (local.weekday !== "Sat" && local.weekday !== "Sun" && local.hour < 16) {
    const roundedMinute = local.minute <= 30 ? 30 : 0;
    const addHour = local.minute <= 30 ? 0 : 1;
    const hour = Math.max(9, local.hour + addHour);
    if (hour < 17) return localToUtc(local.year, local.month, local.day, hour, roundedMinute);
  }
  let candidate = new Date(Date.UTC(local.year, local.month - 1, local.day + 1, 12));
  while (true) {
    const parts = zonedParts(candidate);
    if (parts.weekday !== "Sat" && parts.weekday !== "Sun") return localToUtc(parts.year, parts.month, parts.day, 9, 0);
    candidate = new Date(candidate.getTime() + 86_400_000);
  }
}
function tokens(value: string) {
  return new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((v) => v.length >= 3));
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

    const { data, error } = await access.supabase.rpc("activate_inventory_work_plan", { requested_vehicle_id: vehicleId, requested_plan_version_id: requestedVersionId, requested_company_id: access.company.companyId, requesting_user_id: access.userId });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const result = Array.isArray(data) ? data[0] : data;

    const [{ data: workRows, error: workError }, { data: planItems, error: itemError }] = await Promise.all([
      access.supabase.from("mindful_inventory_work_orders").select("id,plan_item_id,title,category,estimated_elapsed_minutes,estimated_duration_minutes,assigned_partner_id,location_id,resource_id,status").eq("vehicle_id", vehicleId).eq("plan_version_id", requestedVersionId),
      access.supabase.from("mindful_inventory_plan_items").select("id,sequence_order,suggested_partner_id").eq("plan_version_id", requestedVersionId).eq("decision", "approved").order("sequence_order", { ascending: true }),
    ]);
    if (workError) throw new Error(workError.message);
    if (itemError) throw new Error(itemError.message);

    const workByPlanItem = new Map((workRows || []).map((row) => [row.plan_item_id, row]));
    let cursor = nextBusinessMorning();
    let suggestedCount = 0;

    for (const item of planItems || []) {
      const work = workByPlanItem.get(item.id);
      if (!work || work.status === "complete" || work.status === "cancelled") continue;
      const partnerId = item.suggested_partner_id || work.assigned_partner_id || null;
      const durationMinutes = Math.max(60, Number(work.estimated_elapsed_minutes ?? work.estimated_duration_minutes ?? 60) || 60);
      let locationId = work.location_id || null;
      let resourceId = work.resource_id || null;

      if (partnerId && !locationId) {
        const { data: primary } = await access.supabase.from("mindful_inventory_partner_locations").select("location_id").eq("partner_id", partnerId).eq("is_primary", true).limit(1).maybeSingle();
        locationId = primary?.location_id || null;
      }

      if (locationId && !resourceId) {
        const { data: resources, error: resourceError } = await access.supabase.from("mindful_inventory_resources").select("id,name,resource_type").eq("location_id", locationId).eq("active", true);
        if (resourceError) throw new Error(resourceError.message);
        const workTokens = tokens(`${work.category} ${work.title}`);
        const ranked = (resources || []).map((resource) => {
          const resourceTokens = tokens(`${resource.resource_type} ${resource.name}`);
          let score = 0; resourceTokens.forEach((token) => { if (workTokens.has(token)) score += 1; });
          return { resource, score };
        }).filter((entry) => entry.score > 0).sort((a,b) => b.score - a.score);
        if (ranked.length === 1 || (ranked[0] && ranked[0].score > (ranked[1]?.score || 0))) resourceId = ranked[0].resource.id;
      }

      for (let guard = 0; guard < 40; guard += 1) {
        const proposedEnd = new Date(cursor.getTime() + durationMinutes * 60_000);
        const conflictFields = [partnerId ? { field: "assigned_partner_id", id: partnerId } : null, resourceId ? { field: "resource_id", id: resourceId } : null].filter(Boolean) as Array<{ field: string; id: string }>;
        let conflictEnd: string | null = null;
        for (const conflictField of conflictFields) {
          const { data: conflicts, error: conflictError } = await access.supabase.from("mindful_inventory_work_orders").select("scheduled_end_at").eq(conflictField.field, conflictField.id).neq("vehicle_id", vehicleId).not("status", "in", '("complete","cancelled")').lt("scheduled_start_at", proposedEnd.toISOString()).gt("scheduled_end_at", cursor.toISOString()).order("scheduled_end_at", { ascending: false }).limit(1);
          if (conflictError) throw new Error(conflictError.message);
          if (conflicts?.[0]?.scheduled_end_at && (!conflictEnd || conflicts[0].scheduled_end_at > conflictEnd)) conflictEnd = conflicts[0].scheduled_end_at;
        }
        if (!conflictEnd) break;
        cursor = nextBusinessSlot(new Date(conflictEnd));
      }

      const end = new Date(cursor.getTime() + durationMinutes * 60_000);
      const { error: scheduleError } = await access.supabase.from("mindful_inventory_work_orders").update({ assigned_partner_id: partnerId, location_id: locationId, resource_id: resourceId, scheduled_start_at: cursor.toISOString(), scheduled_end_at: end.toISOString(), schedule_source: "suggested", status: "scheduled", updated_by: access.userId, updated_at: new Date().toISOString() }).eq("id", work.id);
      if (scheduleError) throw new Error(scheduleError.message);
      suggestedCount += 1;
      cursor = nextBusinessSlot(end);
    }

    if (suggestedCount > 0) await access.supabase.from("mindful_inventory_history").insert({ company_id: access.company.companyId, vehicle_id: vehicleId, event_type: "suggested_schedule_created", entity_type: "car_plan_version", entity_id: requestedVersionId, actor_user_id: access.userId, summary: "Suggested execution schedule created from performer, location, resource, and existing schedule availability.", metadata: { suggestedWorkOrders: suggestedCount, timeZone: COMPANY_TIME_ZONE } });

    return NextResponse.json({ planVersionId: result?.returned_plan_version_id || requestedVersionId, workOrdersCreated: Number(result?.work_orders_created || 0), suggestedWorkOrders: suggestedCount, activated: Boolean(result?.activated) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to activate Work Plan." }, { status: 500 });
  }
}
