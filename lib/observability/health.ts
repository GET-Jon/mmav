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

export type ApiUsageRow = {
  id: string;
  created_at: string;
  provider: string;
  endpoint: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  api_calls_made: number;
  cache_hit: boolean;
  status: number | null;
  stop_reason: string | null;
  metadata: Record<string, unknown> | null;
};

export type UsageSummary = {
  events: number;
  apiCalls: number;
  failures: number;
  cacheHits: number;
  avgLatencyMs: number | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type UsageBreakdown = UsageSummary & {
  key: string;
  label: string;
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
  usage: {
    ready: boolean;
    day: UsageSummary;
    week: UsageSummary;
    month: UsageSummary;
    providers24h: UsageBreakdown[];
    aiFeatures24h: UsageBreakdown[];
    aiModels24h: UsageBreakdown[];
    recent: ApiUsageRow[];
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

function numberFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = Number(metadata?.[key] || 0);
  return Number.isFinite(value) ? value : 0;
}

function summarizeUsage(rows: ApiUsageRow[]): UsageSummary {
  let apiCalls = 0;
  let failures = 0;
  let cacheHits = 0;
  let latencyTotal = 0;
  let latencyCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;

  for (const row of rows) {
    apiCalls += Number(row.api_calls_made || 0);
    if (row.cache_hit) cacheHits += 1;
    if ((row.status ?? 200) >= 400 || row.metadata?.failed === true) failures += 1;

    const duration = numberFromMetadata(row.metadata, "durationMs");
    if (duration > 0) {
      latencyTotal += duration;
      latencyCount += 1;
    }

    inputTokens += numberFromMetadata(row.metadata, "inputTokens");
    outputTokens += numberFromMetadata(row.metadata, "outputTokens");
    totalTokens += numberFromMetadata(row.metadata, "totalTokens");
  }

  return {
    events: rows.length,
    apiCalls,
    failures,
    cacheHits,
    avgLatencyMs: latencyCount ? Math.round(latencyTotal / latencyCount) : null,
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

function groupUsage(
  rows: ApiUsageRow[],
  keyForRow: (row: ApiUsageRow) => string,
  labelForKey?: (key: string) => string,
): UsageBreakdown[] {
  const groups = new Map<string, ApiUsageRow[]>();

  for (const row of rows) {
    const key = keyForRow(row) || "unknown";
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }

  return Array.from(groups.entries())
    .map(([key, group]) => ({
      key,
      label: labelForKey ? labelForKey(key) : key,
      ...summarizeUsage(group),
    }))
    .sort((a, b) => b.apiCalls - a.apiCalls || b.totalTokens - a.totalTokens);
}

function providerLabel(provider: string) {
  const labels: Record<string, string> = {
    marketcheck: "MarketCheck",
    google_ai: "Google AI",
    auto_dev: "Auto.dev",
    nhtsa_vpic: "NHTSA VIN",
    turn14: "Turn 14",
  };
  return labels[provider] || provider;
}

function featureLabel(feature: string) {
  return feature
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function emptyUsage() {
  return {
    ready: false,
    day: summarizeUsage([]),
    week: summarizeUsage([]),
    month: summarizeUsage([]),
    providers24h: [],
    aiFeatures24h: [],
    aiModels24h: [],
    recent: [],
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
    envCheck("marketcheck", "MarketCheck", Boolean(process.env.MARKETCHECK_API_KEY)),
    envCheck(
      "ai",
      "Google AI",
      Boolean(
        process.env.GEMINI_API_KEY ||
          process.env.GOOGLE_API_KEY ||
          process.env.GOOGLE_AI_API_KEY,
      ),
    ),
    envCheck("autodev", "Auto.dev", Boolean(process.env.AUTODEV_API_KEY)),
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
      usage: emptyUsage(),
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
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    eval24,
    eval7,
    recentEventsResult,
    error24,
    warning24,
    usageResult,
  ] = await Promise.all([
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
      .select(
        "id, created_at, trace_id, subsystem, event_name, status, duration_ms, evaluation_id, vehicle_id, message, metadata",
      )
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
    supabase
      .from("api_usage_events")
      .select(
        "id, created_at, provider, endpoint, vehicle_year, vehicle_make, vehicle_model, api_calls_made, cache_hit, status, stop_reason, metadata",
      )
      .gte("created_at", since30d)
      .order("created_at", { ascending: false })
      .limit(5000),
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

  const usageReady = !usageResult.error;
  checks.push({
    key: "usage",
    label: "Usage Accounting",
    state: usageReady ? "healthy" : "unavailable",
    detail: usageReady
      ? "API and AI usage accounting available"
      : usageResult.error?.message || "Usage accounting unavailable",
  });

  const usageRows = usageReady ? ((usageResult.data || []) as ApiUsageRow[]) : [];
  const dayRows = usageRows.filter((row) => row.created_at >= since24h);
  const weekRows = usageRows.filter((row) => row.created_at >= since7d);
  const aiDayRows = dayRows.filter((row) => row.provider === "google_ai");

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
    usage: {
      ready: usageReady,
      day: summarizeUsage(dayRows),
      week: summarizeUsage(weekRows),
      month: summarizeUsage(usageRows),
      providers24h: groupUsage(dayRows, (row) => row.provider, providerLabel),
      aiFeatures24h: groupUsage(
        aiDayRows,
        (row) => String(row.metadata?.feature || "generate_text"),
        featureLabel,
      ),
      aiModels24h: groupUsage(
        aiDayRows,
        (row) => String(row.metadata?.model || "unknown"),
      ),
      recent: usageRows.slice(0, 50),
    },
    recentEvents: telemetryReady
      ? ((recentEventsResult.data || []) as SystemEventRow[])
      : [],
  };
}
