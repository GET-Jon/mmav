import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { recordApiUsageEvent } from "@/lib/observability/api-usage";
import { vehicleGenerationRules } from "@/lib/vehicle-generations/rules";
import { normalizeVehicleText } from "@/lib/marketcheck/vehicle-identity";
import {
  MOTOR_MATCH_BOOTSTRAP_CORE_CALLS,
  MOTOR_MATCH_BOOTSTRAP_MAX_CALLS,
  MOTOR_MATCH_PAGE_LIMIT,
  motorMatchBootstrapPlan,
} from "./bootstrap-plan";

type AutoDevObservation = {
  listingKey: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  bodyType: string | null;
  drivetrain: string | null;
  fuelType: string | null;
  price: number | null;
  miles: number | null;
  dealer: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  listingUrl: string | null;
  providerUpdatedAt: string | null;
};

type FetchStrategy = { sort: string; page: number };
type YearBand = { startYear: number; endYear: number; generation: string };

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toString = (value: unknown) => String(value ?? "").trim();

function fetchStrategy(repeat: number): FetchStrategy {
  const strategies: FetchStrategy[] = [
    { sort: "updatedAt.desc", page: 1 },
    { sort: "price.asc", page: 1 },
    { sort: "miles.asc", page: 1 },
    { sort: "price.desc", page: 1 },
    { sort: "miles.desc", page: 1 },
    { sort: "updatedAt.desc", page: 2 },
    { sort: "price.asc", page: 2 },
  ];
  return strategies[Math.min(Math.max(repeat - 1, 0), strategies.length - 1)];
}

function modelParts(value: string) {
  return String(value || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function bootstrapYearBands(make: string, model: string): YearBand[] {
  const targetMake = normalizeVehicleText(make);
  const targetModel = normalizeVehicleText(model);
  const bands = vehicleGenerationRules
    .filter(
      (rule) =>
        normalizeVehicleText(rule.make) === targetMake &&
        modelParts(rule.model).some(
          (part) => normalizeVehicleText(part) === targetModel,
        ),
    )
    .map((rule) => ({
      startYear: rule.startYear,
      endYear: rule.endYear,
      generation: rule.generation,
    }))
    .sort((a, b) => b.endYear - a.endYear || b.startYear - a.startYear);

  const seen = new Set<string>();
  return bands.filter((band) => {
    const key = `${band.startYear}-${band.endYear}|${band.generation}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mapListings(payload: any): AutoDevObservation[] {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows
    .map((row: any) => {
      const vehicle = row?.vehicle || {};
      const retail = row?.retailListing || {};
      const location = Array.isArray(row?.location) ? row.location : [];
      const vin = toString(vehicle.vin || row?.vin).toUpperCase() || null;
      const year = toNumber(vehicle.year ?? row?.year);
      const make = toString(vehicle.make || row?.make) || null;
      const model = toString(vehicle.model || row?.model) || null;
      const trim = toString(vehicle.trim || row?.trim) || null;
      const price = toNumber(retail.price ?? row?.price);
      const miles = toNumber(
        retail.miles ??
          retail.mileage ??
          vehicle.miles ??
          vehicle.mileage ??
          row?.miles ??
          row?.mileage,
      );
      const dealer = toString(retail.dealer || row?.dealer) || null;
      const city = toString(retail.city || row?.city) || null;
      const state = toString(retail.state || row?.state) || null;
      const zip = toString(retail.zip || row?.zip) || null;
      const listingUrl =
        toString(retail.vdp || retail.url || row?.vdpUrl || row?.url) || null;
      const providerUpdatedAt =
        toString(
          retail.updatedAt ||
            row?.updatedAt ||
            row?.updated_at ||
            row?.lastSeenAt,
        ) || null;
      const latitude = toNumber(location[1] ?? row?.latitude);
      const longitude = toNumber(location[0] ?? row?.longitude);
      const bodyType =
        toString(vehicle.bodyType || vehicle.bodyStyle || row?.bodyStyle) || null;
      const drivetrain =
        toString(vehicle.drivetrain || row?.drivetrain) || null;
      const fuelType =
        toString(
          vehicle.fuelType ||
            vehicle.fuel ||
            vehicle.powertrain ||
            row?.fuel,
        ) || null;

      const listingKey =
        vin ||
        listingUrl ||
        [
          year,
          make,
          model,
          trim,
          price,
          miles,
          dealer,
          city,
          state,
        ]
          .map((value) => String(value ?? "").toLowerCase())
          .join("|");

      return {
        listingKey,
        vin,
        year,
        make,
        model,
        trim,
        bodyType,
        drivetrain,
        fuelType,
        price,
        miles,
        dealer,
        city,
        state,
        zip,
        latitude,
        longitude,
        listingUrl,
        providerUpdatedAt,
      };
    })
    .filter(
      (row: AutoDevObservation) =>
        row.listingKey &&
        typeof row.price === "number" &&
        row.price > 0 &&
        typeof row.miles === "number" &&
        row.miles >= 0,
    );
}

export function currentMotorMatchCycleKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getOrCreateMotorMatchBootstrapRun(cycleKey = currentMotorMatchCycleKey()) {
  const supabase = createSupabaseAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("motor_match_market_runs")
    .select("*")
    .eq("cycle_key", cycleKey)
    .eq("status", "active")
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from("motor_match_market_runs")
    .insert({
      cycle_key: cycleKey,
      status: "active",
      core_call_budget: MOTOR_MATCH_BOOTSTRAP_CORE_CALLS,
      max_call_budget: MOTOR_MATCH_BOOTSTRAP_MAX_CALLS,
      metadata: {
        purpose: "motor_match_bootstrap",
        plan_models: motorMatchBootstrapPlan.length,
      },
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function nextCoreTask(runId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("motor_match_market_fetches")
    .select("make,model,planned_sequence")
    .eq("run_id", runId);

  if (error) throw error;

  const completed = new Set(
    (data || []).map(
      (row: any) =>
        `${String(row.make).toLowerCase()}|${String(row.model).toLowerCase()}|${Number(row.planned_sequence)}`,
    ),
  );

  for (const item of motorMatchBootstrapPlan) {
    for (let sequence = 1; sequence <= item.calls; sequence += 1) {
      const key = `${item.make.toLowerCase()}|${item.model.toLowerCase()}|${sequence}`;
      if (!completed.has(key)) return { ...item, sequence };
    }
  }

  return null;
}

async function incrementRun(runId: string, calls: number, observations: number) {
  const supabase = createSupabaseAdminClient();
  const { data: run, error: loadError } = await supabase
    .from("motor_match_market_runs")
    .select("calls_used,observations_stored")
    .eq("id", runId)
    .single();
  if (loadError) throw loadError;

  const { error } = await supabase
    .from("motor_match_market_runs")
    .update({
      calls_used: Number(run.calls_used || 0) + calls,
      observations_stored: Number(run.observations_stored || 0) + observations,
    })
    .eq("id", runId);
  if (error) throw error;
}

async function collectOneCoreCall(runId: string, task: NonNullable<Awaited<ReturnType<typeof nextCoreTask>>>) {
  const apiKey = process.env.AUTODEV_API_KEY;
  if (!apiKey) throw new Error("Missing AUTODEV_API_KEY.");

  const supabase = createSupabaseAdminClient();
  const { data: run, error: runError } = await supabase
    .from("motor_match_market_runs")
    .select("calls_used,max_call_budget,status")
    .eq("id", runId)
    .single();

  if (runError) throw runError;
  if (run.status !== "active") throw new Error("Motor Match market run is not active.");
  if (Number(run.calls_used || 0) >= Number(run.max_call_budget || MOTOR_MATCH_BOOTSTRAP_MAX_CALLS)) {
    throw new Error("Motor Match bootstrap call ceiling reached.");
  }

  const yearBands = bootstrapYearBands(task.make, task.model);
  const band = yearBands.length
    ? yearBands[(task.sequence - 1) % yearBands.length]
    : null;
  const repeat = yearBands.length
    ? Math.floor((task.sequence - 1) / yearBands.length) + 1
    : task.sequence;
  const strategy = fetchStrategy(repeat);
  const params = new URLSearchParams({
    "vehicle.make": task.make,
    "vehicle.model": task.model,
    "retailListing.used": "true",
    includes: "total",
    limit: String(MOTOR_MATCH_PAGE_LIMIT),
    sort: strategy.sort,
    page: String(strategy.page),
  });
  if (band) {
    params.set(
      "vehicle.year",
      band.startYear === band.endYear
        ? String(band.startYear)
        : `${band.startYear}-${band.endYear}`,
    );
  }

  const response = await fetch(`https://api.auto.dev/listings?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const raw = await response.text();
  let payload: any = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = { message: raw };
  }

  const observations = response.ok ? mapListings(payload) : [];
  const providerTotal =
    typeof payload?.total === "number" ? payload.total : observations.length;

  let uniqueStored = 0;
  if (observations.length) {
    const rows = observations.map((listing) => ({
      run_id: runId,
      listing_key: listing.listingKey,
      bucket_make: task.make,
      bucket_model: task.model,
      vin: listing.vin,
      year: listing.year,
      make: listing.make,
      model: listing.model,
      trim: listing.trim,
      body_type: listing.bodyType,
      drivetrain: listing.drivetrain,
      fuel_type: listing.fuelType,
      price: listing.price,
      miles: listing.miles,
      dealer: listing.dealer,
      city: listing.city,
      state: listing.state,
      zip: listing.zip,
      latitude: listing.latitude,
      longitude: listing.longitude,
      listing_url: listing.listingUrl,
      provider_updated_at: listing.providerUpdatedAt,
      metadata: { source: "auto_dev", purpose: "bootstrap" },
    }));

    const { data: stored, error: storeError } = await supabase
      .from("motor_match_market_observations")
      .upsert(rows, { onConflict: "run_id,listing_key", ignoreDuplicates: true })
      .select("id");

    if (storeError) throw storeError;
    uniqueStored = stored?.length || 0;
  }

  const errorMessage = response.ok
    ? null
    : typeof payload?.message === "string"
      ? payload.message
      : typeof payload?.error === "string"
        ? payload.error
        : `Auto.dev request failed with status ${response.status}.`;

  const { error: fetchError } = await supabase
    .from("motor_match_market_fetches")
    .insert({
      run_id: runId,
      make: task.make,
      model: task.model,
      planned_sequence: task.sequence,
      sort_key: strategy.sort,
      page: strategy.page,
      returned_count: observations.length,
      provider_total: providerTotal,
      unique_observations: uniqueStored,
      status: response.status,
      error: errorMessage,
      metadata: {
        purpose: "core_bootstrap",
        generation: band?.generation || null,
        yearStart: band?.startYear || null,
        yearEnd: band?.endYear || null,
      },
    });

  if (fetchError) throw fetchError;

  await incrementRun(runId, 1, uniqueStored);
  await recordApiUsageEvent({
    provider: "auto_dev",
    endpoint: "/listings",
    vehicleMake: task.make,
    vehicleModel: task.model,
    apiCallsMade: 1,
    status: response.status,
    stopReason: response.ok ? "motor_match_bootstrap" : "motor_match_bootstrap_error",
    metadata: {
      product: "motor_match",
      purpose: "bootstrap",
      runId,
      sequence: task.sequence,
      sort: strategy.sort,
      page: strategy.page,
      generation: band?.generation || null,
      yearStart: band?.startYear || null,
      yearEnd: band?.endYear || null,
      returned: observations.length,
      uniqueStored,
    },
  });

  if (!response.ok) throw new Error(errorMessage || "Auto.dev bootstrap request failed.");

  return {
    make: task.make,
    model: task.model,
    sequence: task.sequence,
    sort: strategy.sort,
    page: strategy.page,
    generation: band?.generation || null,
    yearStart: band?.startYear || null,
    yearEnd: band?.endYear || null,
    returned: observations.length,
    uniqueStored,
    providerTotal,
  };
}

export async function runMotorMatchBootstrapBatch({
  runId,
  maxCalls = 5,
}: {
  runId: string;
  maxCalls?: number;
}) {
  const safeMax = Math.max(1, Math.min(10, Math.floor(maxCalls)));
  const completed = [];

  for (let i = 0; i < safeMax; i += 1) {
    const task = await nextCoreTask(runId);
    if (!task) break;
    completed.push(await collectOneCoreCall(runId, task));
  }

  const supabase = createSupabaseAdminClient();
  const next = await nextCoreTask(runId);

  if (!next) {
    await supabase
      .from("motor_match_market_runs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", runId)
      .eq("status", "active");
  }

  const { data: run, error } = await supabase
    .from("motor_match_market_runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (error) throw error;

  return {
    run,
    completed,
    coreComplete: !next,
    nextTask: next,
  };
}

export async function getMotorMatchBootstrapStatus(runId: string) {
  const supabase = createSupabaseAdminClient();
  const [{ data: run, error: runError }, { data: fetches, error: fetchError }] =
    await Promise.all([
      supabase.from("motor_match_market_runs").select("*").eq("id", runId).single(),
      supabase
        .from("motor_match_market_fetches")
        .select("make,model,planned_sequence,returned_count,unique_observations,status")
        .eq("run_id", runId),
    ]);

  if (runError) throw runError;
  if (fetchError) throw fetchError;

  const callsByModel = new Map<string, number>();
  for (const row of fetches || []) {
    const key = `${row.make}|${row.model}`;
    callsByModel.set(key, (callsByModel.get(key) || 0) + 1);
  }

  return {
    run,
    coreTarget: MOTOR_MATCH_BOOTSTRAP_CORE_CALLS,
    maxTarget: MOTOR_MATCH_BOOTSTRAP_MAX_CALLS,
    fetchCount: fetches?.length || 0,
    remainingCoreCalls: Math.max(
      0,
      MOTOR_MATCH_BOOTSTRAP_CORE_CALLS - (fetches?.length || 0),
    ),
    modelsStarted: callsByModel.size,
    modelsPlanned: motorMatchBootstrapPlan.length,
  };
}
