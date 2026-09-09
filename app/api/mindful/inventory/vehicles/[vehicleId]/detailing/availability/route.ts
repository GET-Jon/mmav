import { NextResponse } from "next/server";

import { getMindfulInventoryAccess } from "@/lib/mindful-inventory/access";

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB;
}

function localParts(date: Date, offsetMinutes: number) {
  const shifted = new Date(date.getTime() - offsetMinutes * 60_000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate(), weekday: shifted.getUTCDay() };
}

function fromLocal(year: number, month: number, day: number, hour: number, minute: number, offsetMinutes: number) {
  return new Date(Date.UTC(year, month, day, hour, minute) + offsetMinutes * 60_000);
}

export async function GET(request: Request, context: { params: Promise<{ vehicleId: string }> }) {
  try {
    const access = await getMindfulInventoryAccess();
    if (!access) return NextResponse.json({ error: "Mindful Inventory access denied." }, { status: 403 });
    const { vehicleId } = await context.params;
    const url = new URL(request.url);
    const partnerId = String(url.searchParams.get("partnerId") || "").trim() || null;
    const durationRaw = Number(url.searchParams.get("durationMinutes") || "120");
    const durationMinutes = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.min(12 * 60, durationRaw) : 120;
    const offsetRaw = Number(url.searchParams.get("tzOffset") || "0");
    const offsetMinutes = Number.isFinite(offsetRaw) ? Math.max(-840, Math.min(840, offsetRaw)) : 0;

    const { data: companyVehicles, error: vehicleError } = await access.supabase
      .from("mindful_inventory_vehicles")
      .select("id")
      .eq("company_id", access.company.companyId);
    if (vehicleError) throw new Error(vehicleError.message);
    const vehicleIds = (companyVehicles || []).map((row) => row.id);
    if (!vehicleIds.includes(vehicleId)) return NextResponse.json({ error: "Vehicle is outside the current company." }, { status: 403 });

    if (partnerId) {
      const { data: partner } = await access.supabase.from("mindful_inventory_partners").select("id").eq("id", partnerId).eq("company_id", access.company.companyId).eq("active", true).maybeSingle();
      if (!partner) return NextResponse.json({ error: "Selected detailing partner is not available." }, { status: 400 });
    }

    const [workResult, detailResult] = await Promise.all([
      vehicleIds.length ? access.supabase
        .from("mindful_inventory_work_orders")
        .select("vehicle_id,assigned_partner_id,scheduled_start_at,scheduled_end_at,proposed_start_at,proposed_end_at,status")
        .in("vehicle_id", vehicleIds)
        .not("status", "in", '("complete","cancelled")') : Promise.resolve({ data: [], error: null }),
      vehicleIds.length ? access.supabase
        .from("mindful_inventory_detailing")
        .select("vehicle_id,partner_id,scheduled_start_at,proposed_start_at,expected_turnaround_minutes,status")
        .in("vehicle_id", vehicleIds)
        .not("status", "in", '("completed","accepted")') : Promise.resolve({ data: [], error: null }),
    ]);
    if (workResult.error) throw new Error(workResult.error.message);
    if (detailResult.error) throw new Error(detailResult.error.message);

    const busy: Array<{ start: number; end: number; vehicleId: string; partnerId: string | null }> = [];
    for (const row of workResult.data || []) {
      const startValue = row.scheduled_start_at || row.proposed_start_at;
      const endValue = row.scheduled_end_at || row.proposed_end_at;
      if (!startValue || !endValue) continue;
      const start = new Date(startValue).getTime(); const end = new Date(endValue).getTime();
      if (Number.isFinite(start) && Number.isFinite(end)) busy.push({ start, end, vehicleId: row.vehicle_id, partnerId: row.assigned_partner_id });
    }
    for (const row of detailResult.data || []) {
      if (row.vehicle_id === vehicleId) continue;
      const startValue = row.scheduled_start_at || row.proposed_start_at;
      if (!startValue) continue;
      const start = new Date(startValue).getTime();
      const duration = Number(row.expected_turnaround_minutes || 120);
      const end = start + (Number.isFinite(duration) && duration > 0 ? duration : 120) * 60_000;
      if (Number.isFinite(start)) busy.push({ start, end, vehicleId: row.vehicle_id, partnerId: row.partner_id });
    }

    const now = Date.now();
    const firstCandidate = new Date(Math.ceil((now + 30 * 60_000) / (30 * 60_000)) * 30 * 60_000);
    const firstLocal = localParts(firstCandidate, offsetMinutes);
    const suggestions: Array<{ startAt: string; endAt: string }> = [];
    const selectedByDay = new Map<string, number[]>();

    for (let dayOffset = 0; dayOffset < 14 && suggestions.length < 6; dayOffset += 1) {
      const baseNoon = fromLocal(firstLocal.year, firstLocal.month, firstLocal.day + dayOffset, 12, 0, offsetMinutes);
      const p = localParts(baseNoon, offsetMinutes);
      if (p.weekday === 0 || p.weekday === 6) continue;
      const dayKey = `${p.year}-${p.month}-${p.day}`;
      for (let minuteOfDay = 8 * 60; minuteOfDay + durationMinutes <= 17 * 60 && suggestions.length < 6; minuteOfDay += 30) {
        const start = fromLocal(p.year, p.month, p.day, Math.floor(minuteOfDay / 60), minuteOfDay % 60, offsetMinutes);
        if (start.getTime() < firstCandidate.getTime()) continue;
        const daySelections = selectedByDay.get(dayKey) || [];
        if (daySelections.length >= 2 || daySelections.some((value) => Math.abs(start.getTime() - value) < 2 * 60 * 60_000)) continue;
        const end = new Date(start.getTime() + durationMinutes * 60_000);
        const conflict = busy.some((item) => overlaps(start.getTime(), end.getTime(), item.start, item.end) && (item.vehicleId === vehicleId || Boolean(partnerId && item.partnerId === partnerId)));
        if (conflict) continue;
        suggestions.push({ startAt: start.toISOString(), endAt: end.toISOString() });
        selectedByDay.set(dayKey, [...daySelections, start.getTime()]);
      }
    }

    return NextResponse.json({ durationMinutes, suggestions, guidance: partnerId ? null : "Choose a detailer to include that partner's workload in suggestions" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not calculate detailing availability." }, { status: 500 });
  }
}
