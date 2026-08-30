import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth";

function timezoneOffsetMs(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const values = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const renderedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return renderedAsUtc - date.getTime();
}

function wallClockToIso(value: unknown, timeZone: string) {
  if (!value) return null;
  const text = String(value).trim();
  if (/([zZ]|[+-]\d\d:\d\d)$/.test(text)) {
    const absolute = new Date(text);
    return Number.isNaN(absolute.getTime()) ? undefined : absolute.toISOString();
  }

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second = "00"] = match;
  const wallClockAsUtc = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  ));

  let resultMs = wallClockAsUtc.getTime() - timezoneOffsetMs(wallClockAsUtc, timeZone);
  const correctedOffset = timezoneOffsetMs(new Date(resultMs), timeZone);
  resultMs = wallClockAsUtc.getTime() - correctedOffset;
  const result = new Date(resultMs);
  return Number.isNaN(result.getTime()) ? undefined : result.toISOString();
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workOrderId: string }> },
) {
  try {
    const authClient = await createSupabaseServerAuthClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { workOrderId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const admin = createSupabaseAdminClient();

    const { data: work, error: workError } = await admin
      .from("mindful_inventory_work_orders")
      .select("id,status,assigned_partner_id,scheduled_start_at,scheduled_end_at,proposed_start_at,proposed_end_at")
      .eq("id", workOrderId)
      .maybeSingle();
    if (workError) throw new Error(workError.message);
    if (!work?.assigned_partner_id) return NextResponse.json({ error: "Assigned Work Order not found." }, { status: 404 });
    if (["in_progress", "complete", "cancelled"].includes(work.status)) {
      return NextResponse.json({ error: "This Work Order can no longer be rescheduled here." }, { status: 409 });
    }

    const { data: partner, error: partnerError } = await admin
      .from("mindful_inventory_partners")
      .select("id,user_id,active,company_id")
      .eq("id", work.assigned_partner_id)
      .maybeSingle();
    if (partnerError) throw new Error(partnerError.message);
    if (!partner || !partner.active || partner.user_id !== user.id) {
      return NextResponse.json({ error: "You are not the assigned partner for this Work Order." }, { status: 403 });
    }

    const [{ data: permissions, error: permissionError }, { data: company, error: companyError }] = await Promise.all([
      admin
        .from("mindful_inventory_partner_permissions")
        .select("view_assigned_work,reschedule_work")
        .eq("partner_id", partner.id)
        .maybeSingle(),
      admin
        .from("companies")
        .select("timezone")
        .eq("id", partner.company_id)
        .maybeSingle(),
    ]);
    if (permissionError) throw new Error(permissionError.message);
    if (companyError) throw new Error(companyError.message);
    if (!permissions?.view_assigned_work || !permissions.reschedule_work) {
      return NextResponse.json({ error: "Schedule changes are not enabled for this partner." }, { status: 403 });
    }

    const timeZone = company?.timezone || "America/New_York";
    const startAt = wallClockToIso(body.startAt, timeZone);
    const endAt = wallClockToIso(body.endAt, timeZone);
    if (startAt === undefined || endAt === undefined || !startAt || !endAt) {
      return NextResponse.json({ error: "Enter a valid start and completion time." }, { status: 400 });
    }
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      return NextResponse.json({ error: "Completion time must be after the start time." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await admin
      .from("mindful_inventory_work_orders")
      .update({
        proposed_start_at: work.proposed_start_at || work.scheduled_start_at,
        proposed_end_at: work.proposed_end_at || work.scheduled_end_at,
        scheduled_start_at: startAt,
        scheduled_end_at: endAt,
        partner_confirmation_status: "confirmed",
        schedule_source: "manual",
        status: work.status === "ready_to_schedule" ? "scheduled" : work.status,
        updated_at: now,
        updated_by: user.id,
      })
      .eq("id", workOrderId)
      .eq("assigned_partner_id", partner.id)
      .select("id,scheduled_start_at,scheduled_end_at,proposed_start_at,proposed_end_at,partner_confirmation_status")
      .single();
    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ ...updated, timezone: timeZone });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Schedule could not be updated." },
      { status: 500 },
    );
  }
}
