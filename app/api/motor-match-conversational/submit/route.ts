import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const PROJECT_REF = "dxjqjhvecncjdbhxbvjb";
const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;
const MAX_BODY_BYTES = 16_384;
const fail = (message: string, status: number) => NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

type RecordLike = Record<string, unknown>;
const asObject = (v: unknown): RecordLike | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as RecordLike : null;
const clean = (v: unknown, max = 200): string => typeof v === "string" ? v.trim().slice(0, max) : "";
const validBudget = (v: unknown): boolean => Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) <= 10_000_000;
const validMileage = (v: unknown): boolean => v === "flexible" || (Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) <= 1_000_000);
const allowed = new Set(["vehicle", "budget", "mileage"]);

export async function POST(req: NextRequest) {
  // Fail closed. This route MUST NEVER fall back to the general Lot Logic env vars.
  const key = process.env.MOTOR_MATCH_DEV_SERVICE_ROLE_KEY;
  const suppliedUrl = process.env.MOTOR_MATCH_DEV_SUPABASE_URL;
  if (!key || suppliedUrl !== PROJECT_URL) {
    return fail("This development preview is not accepting requests yet. Please try again later.", 503);
  }
  if ((Number(req.headers.get("content-length")) || 0) > MAX_BODY_BYTES) return fail("Request is too large.", 413);

  let body: RecordLike | null = null;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return fail("Request is too large.", 413);
    body = asObject(JSON.parse(raw));
  } catch { return fail("Invalid request.", 400); }
  if (!body) return fail("Invalid request.", 400);
  const name = clean(body.name, 120);
  const contact = clean(body.contact, 200);
  const current = asObject(body.criteria);
  const original = asObject(body.original);
  if (!current || !original || name.length < 2 || contact.length < 5 || !contact.includes("@") && !/[0-9].*[0-9].*[0-9]/.test(contact)) {
    return fail("Please check your contact information and search details.", 400);
  }
  for (const row of [current, original]) {
    if (clean(row.vehicle, 140).length < 3 || !validBudget(row.budget) || !validMileage(row.mileage) || !["vehicle", "out_the_door"].includes(String(row.budgetKind))) {
      return fail("Please enter a valid vehicle, budget, and mileage limit.", 400);
    }
  }
  if (!["no", "yes", "maybe"].includes(String(body.trade))) return fail("Invalid trade selection.", 400);
  const cars = Array.isArray(body.additionalCars) ? body.additionalCars : [];
  const changes = Array.isArray(body.changes) ? body.changes : [];
  if (cars.length > 8 || changes.length > 100 || cars.some(x => clean(x,140).length < 3) || changes.some(x => { const v=asObject(x); return !v || !allowed.has(String(v.field)) || typeof v.from !== "string" || typeof v.to !== "string"; })) {
    return fail("Invalid search adjustments.", 400);
  }
  const vin = clean(body.tradeVin, 17).toUpperCase();
  if (vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return fail("Please enter a valid 17-character VIN, or leave it blank.", 400);
  const tradeMiles = clean(body.tradeMiles, 12);
  if (tradeMiles && !(Number.isInteger(Number(tradeMiles)) && Number(tradeMiles) >= 0 && Number(tradeMiles) <= 2_000_000)) return fail("Invalid current vehicle mileage.", 400);

  // Honeypot for basic automated-spam rejection; not a substitute for edge rate limiting.
  if (clean(body.companyWebsite)) return fail("Request received.", 200);

  try {
    const db = createClient(PROJECT_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc("mm_submit_intake", {
      input: {
        name, contact,
        current: { vehicle: clean(current.vehicle,140), budget: Number(current.budget), mileage: String(current.mileage), budgetKind: current.budgetKind },
        original: { vehicle: clean(original.vehicle,140), budget: Number(original.budget), mileage: String(original.mileage), budgetKind: original.budgetKind },
        changes: changes.map(x => { const v=asObject(x)!; return { field: v.field, from: clean(v.from,200), to: clean(v.to,200) }; }),
        additionalCars: cars.map(x => clean(x,140)),
        alternatives: body.alternatives === true,
        trade: body.trade,
        tradeVin: vin || null,
        tradeMiles: tradeMiles ? Number(tradeMiles) : null
      }
    });
    if (error || !data) {
      console.error("Motor Match intake write failed", error?.code ?? "unknown");
      return fail("We couldn't save your request. Please try again.", 502);
    }
    return NextResponse.json({ accepted: true, requestId: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("Our intake service is temporarily unavailable.", 503);
  }
}
