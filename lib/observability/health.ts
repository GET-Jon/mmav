import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type HealthState = "healthy" | "warning" | "unavailable" | "not_configured";

export type HealthCheck = {
  key: string;
  label: string;
  state: HealthState;
  detail: string;
  latencyMs?: number | null;
};

export type SystemEventRow = {
  id: string;
  created_at: string;
  trace_id: string;
  subsystem: string;
  event_name: string;
  status: "ok" | "warning" | "error";
  duration_ms: number | null;
  evaluation_id: string | null;
  vehicle_id: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
};

export type SystemHealthSnapshot = {
  generatedAt: string;
  checks: HealthCheck[];
  metrics: {
    evaluations24h: number | null;
    evaluations7d: number | null;
    errors24h: number | null;
    warnings24h: number | null;
    telemetryReady: boolean;
  };
  recentEvents: SystemEventRow[];
};

function envCheck(key: string, label: string, configured: boolean): HealthCheck {
  return {
    key,
    label,
    state: configured ? "healthy" : "not_configured",
    detail: configured ? "Configured" : "Configuration missing",
  };
}

export async function getSystemHealthSnapshot(limit = 40): Promise<SystemHealthSnapshot> {
  const checks: HealthCheck[] = [
    {
      key: "application",
      label: "Application",
      state: "healthy",
      detail: process.env.CONTEXT
        ? `${process.env.CONTEXT} deployment`
        : process.env.NODE_ENV || "runtime available",
    },
    envCheck(
      "marketcheck",
      "MarketCheck",
      Boolean(process.env.MARKETCHECK_API_KEY),
    ),
    envCheck(
      "ai",
      "Google AI",
      Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    ),
  ];

  const supabaseUrlConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrlConfigured || !serviceRoleConfigured) {
    checks.push({
      key: "database",
      label: "Database",
      state: "not_configured",
      detail: "Supabase server configuration missing",
    });
    return {
      generatedAt: new Date().toISOString(),
      checks,
      metrics: {
        evaluations24h: null,
        evaluations7d: null,
        errors24h: null,
        warnings24h: null,
        telemetryReady: false,
      },
      recentEvents: [],
    };
  }

  const supabase = createSupabaseAdminClient();
  const dbStarted = Date.now();
  const { error: dbError } = await supabase
    .from("auction_evaluations")
    .select("id", { head: true, count: "exact" });
  const dbLatencyMs = Date.now() - dbStarted;

  checks.push({
    key: "database",
    label: "Database",
    state: dbError ? "unavailable" : dbLatencyMs > 1200 ? "warning" : "healthy",
    detail: dbError ? dbError.message : `Responding in ${dbLatencyMs} ms`,
    latencyMs: dbLatencyMs,
  });

  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [eval24, eval7, recentEventsResult, error24, warning24] = await Promise.all([
    supabase
      .from("auction_evaluations")
      .select("id", { head: true, count: "exact" })
      .gte("created_at", since24h),
    supabase
      .from("auction_evaluations")
      .select("id", { head: true, count: "exact" })
      .gte("created_at", since7d),
    supabase
      .from("system_events")
      .select("id, created_at, trace_id, subsystem, event_name, status, duration_ms, evaluation_id, vehicle_id, message, metadata")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("system_events")
      .select("id", { head: true, count: "exact" })
      .eq("status", "error")
      .gte("created_at", since24h),
    supabase
      .from("system_events")
      .select("id", { head: true, count: "exact" })
      .eq("status", "warning")
      .gte("created_at", since24h),
  ]);

  const telemetryReady = !recentEventsResult.error;
  checks.push({
    key: "telemetry",
    label: "Event Trace",
    state: telemetryReady ? "healthy" : "not_configured",
    detail: telemetryReady
      ? "Telemetry table available"
      : "Ready in code; database migration not yet applied",
  });

  return {
    generatedAt: new Date().toISOString(),
    checks,
    metrics: {
      evaluations24h: eval24.error ? null : eval24.count ?? 0,
      evaluations7d: eval7.error ? null : eval7.count ?? 0,
      errors24h: error24.error ? null : error24.count ?? 0,
      warnings24h: warning24.error ? null : warning24.count ?? 0,
      telemetryReady,
    },
    recentEvents: telemetryReady
      ? ((recentEventsResult.data || []) as SystemEventRow[])
      : [],
  };
}
