import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type ApiUsageEventInput = {
  companyId?: string | null;
  userId?: string | null;
  provider: string;
  endpoint?: string | null;
  vehicleYear?: number | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  apiCallsMade?: number;
  cacheHit?: boolean;
  status?: number | null;
  stopReason?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Best-effort usage accounting. Usage telemetry must never interrupt the
 * evaluator, inventory, or partner workflows.
 */
export async function recordApiUsageEvent(input: ApiUsageEventInput) {
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("api_usage_events").insert({
      company_id: input.companyId ?? null,
      user_id: input.userId ?? null,
      provider: input.provider,
      endpoint: input.endpoint ?? null,
      vehicle_year:
        typeof input.vehicleYear === "number" && Number.isFinite(input.vehicleYear)
          ? Math.round(input.vehicleYear)
          : null,
      vehicle_make: input.vehicleMake ?? null,
      vehicle_model: input.vehicleModel ?? null,
      api_calls_made: Math.max(0, Math.round(input.apiCallsMade ?? 1)),
      cache_hit: input.cacheHit === true,
      status: input.status ?? null,
      stop_reason: input.stopReason ?? null,
      metadata: input.metadata ?? {},
    });

    if (error && process.env.NODE_ENV !== "production") {
      console.warn("API usage event was not persisted:", error.message);
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("API usage event failed:", error);
    }
  }
}
