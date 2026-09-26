import { randomUUID } from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type SystemEventStatus = "ok" | "warning" | "error";

export type SystemEventInput = {
  companyId?: string | null;
  userId?: string | null;
  traceId?: string | null;
  subsystem: string;
  eventName: string;
  status?: SystemEventStatus;
  durationMs?: number | null;
  evaluationId?: string | null;
  vehicleId?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
};

export function createTraceId(prefix = "trace") {
  return `${prefix}_${randomUUID()}`;
}

/**
 * Best-effort telemetry. Observability must never break the user workflow.
 * Until the system_events migration is deployed this intentionally fails closed.
 */
export async function recordSystemEvent(input: SystemEventInput) {
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("system_events").insert({
      company_id: input.companyId ?? null,
      user_id: input.userId ?? null,
      trace_id: input.traceId || createTraceId(input.subsystem),
      subsystem: input.subsystem,
      event_name: input.eventName,
      status: input.status ?? "ok",
      duration_ms:
        typeof input.durationMs === "number" && Number.isFinite(input.durationMs)
          ? Math.max(0, Math.round(input.durationMs))
          : null,
      evaluation_id: input.evaluationId ?? null,
      vehicle_id: input.vehicleId ?? null,
      message: input.message ?? null,
      metadata: input.metadata ?? {},
    });

    if (error && process.env.NODE_ENV !== "production") {
      console.warn("Observability event was not persisted:", error.message);
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Observability event failed:", error);
    }
  }
}
