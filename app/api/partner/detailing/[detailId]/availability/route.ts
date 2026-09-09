import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth";

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB;
}

function roundUp(date: Date, minutes = 30) {
  const step = minutes * 60_000;
  return new Date(Math.ceil(date.getTime() / step) * step);
}

export async function GET(request: Request, context: { params: Promise<{ detailId: string }> }) {
  try {
    const authClient = await createSupabaseServerAuthClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { detailId } = await context.params;
    const url = new URL(request.url);
    const requestedDuration = Number(url.searchParams.get("durationMinutes") || "0");
    const admin = createSupabaseAdminClient();

    const { data: detail, error: detailError } = await admin
      .from("mindful_inventory_detailing")
      .select("id,vehicle_id,partner_id,expected_turnaround_minutes")
      .eq("id", detailId)
      .maybeSingle();
    if (detailError) throw new Error(detailError.message);
    if (!detail?.partner_id) return NextResponse.json({ error: "Detailing assignment not found." }, { status: 404 });

    const { data: partner, error: partnerError } = await admin
      .from("mindful_inventory_partners")
      .select("id,user_id,company_id,active")
      .eq("id", detail.partner_id)
      .maybeSingle();
    if (partnerError) throw new Error(partnerError.message);
    if (!partner || !partner.active || partner.user_id !== user.id) return NextResponse.json({ error: "You are not assigned to this detailing job." }, { status: 403 });

    const durationRaw = requestedDuration > 0 ? requestedDuration : Number(detail.expected_turnaround_minutes || 120);
    const durationMinutes = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.min(12 * 60, durationRaw) : 120;

    const { data: vehicleRows, error: vehicleError } = await admin.from("mindful_inventory_vehicles").select("id").eq("company_id", partner.company_id);
    if (vehicleError) throw new Error(vehicleError.message);
    const vehicleIds = (vehicleRows || []).map((row) => row.id);

    const [workResult, detailingResult] = await Promise.all([
      vehicleIds.length ? admin.from("mindful_inventory_work_orders")
        .select("vehicle_id,assigned_partner_id,scheduled_start_at,scheduled_end_at,proposed_start_at,proposed_end_at,status")
        .in("vehicle_id", vehicleIds).not("status", "in", '("complete","cancelled")') : Promise.resolve({ data: [], error: null }),
      admin.from("mindful_inventory_detailing")
        .select("id,vehicle_id,partner_id,scheduled_start_at,proposed_start_at,expected_turnaround_minutes,status")
        .eq("partner_id", partner.id).neq("id", detailId).not("status", "in", '("completed","accepted")'),
    ]);
    if (workResult.error) throw new Error(workResult.error.message);
    if (detailingResult.error) throw new Error(detailingResult.error.message);

    const busy: Array<{ start: number; end: number; vehicleId: string }> = [];
    for (const row of workResult.data || []) {
      if (row.assigned_partner_id !== partner.id && row.vehicle_id !== detail.vehicle_id) continue;
      const startValue = row.scheduled_start_at || row.proposed_start_at;
      const endValue = row.scheduled_end_at || row.proposed_end_at;
      if (!startValue || !endValue) continue;
      const start = new Date(startValue).getTime(); const end = new Date(endValue).getTime();
      if (Number.isFinite(start) && Number.isFinite(end)) busy.push({ start, end, vehicleId: row.vehicle_id });
    }
    for (const row of detailingResult.data || []) {
      const startValue = row.scheduled_start_at || row.proposed_start_at;
      if (!startValue) continue;
      const start = new Date(startValue).getTime();
      const otherDuration = Number(row.expected_turnaround_minutes || 120);
      const end = start + (Number.isFinite(otherDuration) && otherDuration > 0 ? otherDuration : 120) * 60_000;
      if (Number.isFinite(start)) busy.push({ start, end, vehicleId: row.vehicle_id });
    }

    const now = new Date();
    const cursor = roundUp(new Date(now.getTime() + 30 * 60_000));
    const suggestions: Array<{ startAt: string; endAt: string }> = [];
    const selectedByDay = new Map<string, number[]>();
    for (let day = 0; day < 14 && suggestions.length < 6; day += 1) {
      const date = new Date(cursor); date.setDate(cursor.getDate() + day);
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      for (let minute = 8 * 60; minute + durationMinutes <= 17 * 60 && suggestions.length < 6; minute += 30) {
        const start = new Date(date); start.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
        if (start.getTime() < now.getTime() + 30 * 60_000) continue;
        const daySelections = selectedByDay.get(dayKey) || [];
        if (daySelections.length >= 2 || daySelections.some((value) => Math.abs(start.getTime() - value) < 2 * 60 * 60_000)) continue;
        const end = new Date(start.getTime() + durationMinutes * 60_000);
        if (busy.some((item) => overlaps(start.getTime(), end.getTime(), item.start, item.end))) continue;
        suggestions.push({ startAt: start.toISOString(), endAt: end.toISOString() });
        selectedByDay.set(dayKey, [...daySelections, start.getTime()]);
      }
    }
    return NextResponse.json({ durationMinutes, suggestions });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not calculate detailing availability." }, { status: 500 });
  }
}
