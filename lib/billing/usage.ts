import type { SupabaseClient } from "@supabase/supabase-js";

import { getCurrentCompanyForUser } from "@/lib/supabase/company";

export type UsageKind =
  | "evaluation_completed"
  | "market_search"
  | "auto_dev_discovery"
  | "condition_analysis"
  | "evaluation_summary"
  | "provider_api_call";

export type PlanKey = "starter" | "dealer" | "dealer_pro";

type PlanLimits = {
  evaluationsPerMonth: number;
  seats: number;
  marketSearchesPerEvaluation: number;
  autoDevPerEvaluation: number;
  conditionAnalysesPerEvaluation: number;
  evaluationSummariesPerEvaluation: number;
  providerCallsPerMonth: number;
};

export const PLAN_LIMITS: Record<PlanKey, PlanLimits> = {
  starter: {
    evaluationsPerMonth: 20,
    seats: 1,
    marketSearchesPerEvaluation: 6,
    autoDevPerEvaluation: 2,
    conditionAnalysesPerEvaluation: 5,
    evaluationSummariesPerEvaluation: 5,
    providerCallsPerMonth: 250,
  },
  dealer: {
    evaluationsPerMonth: 75,
    seats: 3,
    marketSearchesPerEvaluation: 8,
    autoDevPerEvaluation: 3,
    conditionAnalysesPerEvaluation: 8,
    evaluationSummariesPerEvaluation: 8,
    providerCallsPerMonth: 900,
  },
  dealer_pro: {
    evaluationsPerMonth: 200,
    seats: 5,
    marketSearchesPerEvaluation: 12,
    autoDevPerEvaluation: 4,
    conditionAnalysesPerEvaluation: 12,
    evaluationSummariesPerEvaluation: 12,
    providerCallsPerMonth: 2500,
  },
};

export const TRIAL_LIMITS = {
  evaluationsTotal: 5,
  trialDays: 14,
  marketSearchesPerEvaluation: 3,
  autoDevPerEvaluation: 1,
  conditionAnalysesPerEvaluation: 3,
  evaluationSummariesPerEvaluation: 3,
  // Per-evaluation feature limits are the user-facing trial guardrails.\n  // Keep this workspace-wide provider ceiling high enough that a user can\n  // actually use all 5 trial evaluations without normal MarketCheck/VIN/AI\n  // calls unexpectedly blocking a later evaluation.\n  providerCallsTotal: 150,
};

function normalizePlanKey(value: unknown): PlanKey {
  const plan = String(value || "").trim().toLowerCase();
  if (plan === "dealer" || plan === "dealer_pro") return plan;
  return "starter";
}

function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function isPaidStatus(status: string) {
  return status === "active" || status === "past_due" || status === "comped";
}

export function evaluationUsageSubject(input: {
  evaluationUsageId?: unknown;
  vin?: unknown;
  year?: unknown;
  make?: unknown;
  model?: unknown;
  trim?: unknown;
}) {
  const rawId = String(input.evaluationUsageId || "").trim();
  const safeId = rawId.replace(/[^a-zA-Z0-9:_-]+/g, "").slice(0, 120);

  if (safeId) {
    return safeId.startsWith("evaluation:")
      ? safeId
      : `evaluation:${safeId}`;
  }

  // Backwards compatibility for older clients/saved evaluations. New evaluator
  // sessions should always send evaluationUsageId so per-evaluation limits are
  // never accidentally accumulated forever against one VIN.
  return vehicleUsageSubject(input);
}

export function vehicleUsageSubject(input: {
  vin?: unknown;
  year?: unknown;
  make?: unknown;
  model?: unknown;
  trim?: unknown;
}) {
  const vin = String(input.vin || "").trim().toUpperCase();
  if (vin.length === 17) return `vin:${vin}`;

  const clean = (value: unknown) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  return [
    "vehicle",
    clean(input.year),
    clean(input.make),
    clean(input.model),
    clean(input.trim),
  ]
    .filter(Boolean)
    .join(":");
}

async function countUsage(
  supabase: SupabaseClient,
  companyId: string,
  eventType: UsageKind,
  options: { subjectKey?: string | null; since?: string | null } = {},
) {
  let query = supabase
    .from("company_usage_events")
    .select("units")
    .eq("company_id", companyId)
    .eq("event_type", eventType);

  if (options.subjectKey) query = query.eq("subject_key", options.subjectKey);
  if (options.since) query = query.gte("created_at", options.since);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data || []).reduce((sum, row) => sum + Number(row.units || 0), 0);
}

export async function getCompanyUsageContext(
  supabase: SupabaseClient,
  userId: string,
) {
  const company = await getCurrentCompanyForUser(supabase, userId);
  const { data: billing, error } = await supabase
    .from("company_billing_accounts")
    .select("status,plan_key,trial_ends_at")
    .eq("company_id", company.companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const status = String(billing?.status || "not_configured");
  const planKey = normalizePlanKey(billing?.plan_key);
  const internalUnlimited = company.companySlug === "mindful-motor-co";
  const trialEndsAt = billing?.trial_ends_at ? new Date(billing.trial_ends_at) : null;
  const trialActive =
    !internalUnlimited &&
    status === "trialing" &&
    Boolean(trialEndsAt && trialEndsAt.getTime() > Date.now());

  return {
    company,
    status,
    planKey,
    internalUnlimited,
    trialEndsAt: trialEndsAt?.toISOString() || null,
    trialActive,
    paidActive: internalUnlimited || isPaidStatus(status),
  };
}

export async function getUsageSummary(
  supabase: SupabaseClient,
  userId: string,
) {
  const context = await getCompanyUsageContext(supabase, userId);
  const { company, planKey, internalUnlimited, trialActive, paidActive } = context;

  const [trialEvaluationsUsed, monthlyEvaluationsUsed, monthlyProviderCalls] =
    await Promise.all([
      countUsage(supabase, company.companyId, "evaluation_completed"),
      countUsage(supabase, company.companyId, "evaluation_completed", {
        since: monthStartIso(),
      }),
      countUsage(supabase, company.companyId, "provider_api_call", {
        since: monthStartIso(),
      }),
    ]);

  const limits = PLAN_LIMITS[planKey];

  return {
    ...context,
    trialEvaluationsUsed,
    trialEvaluationsRemaining: internalUnlimited
      ? null
      : Math.max(0, TRIAL_LIMITS.evaluationsTotal - trialEvaluationsUsed),
    monthlyEvaluationsUsed,
    monthlyEvaluationsRemaining: internalUnlimited
      ? null
      : Math.max(0, limits.evaluationsPerMonth - monthlyEvaluationsUsed),
    monthlyProviderCalls,
    limits,
    trialLimits: TRIAL_LIMITS,
    canUsePaidProviders:
      internalUnlimited ||
      paidActive ||
      (trialActive && trialEvaluationsUsed < TRIAL_LIMITS.evaluationsTotal),
  };
}

export async function checkUsageAllowance(args: {
  supabase: SupabaseClient;
  userId: string;
  kind: UsageKind;
  subjectKey?: string | null;
  expectedUnits?: number;
}) {
  const { supabase, userId, kind, subjectKey = null } = args;
  const expectedUnits = Math.max(1, Math.round(args.expectedUnits || 1));
  const summary = await getUsageSummary(supabase, userId);

  if (summary.internalUnlimited) {
    return { allowed: true as const, summary };
  }

  if (!summary.paidActive && !summary.trialActive) {
    return {
      allowed: false as const,
      code: "TRIAL_EXPIRED",
      status: 402,
      message: "Your free trial has ended. Choose a plan to continue evaluating vehicles.",
      summary,
    };
  }

  if (
    !summary.paidActive &&
    summary.trialEvaluationsUsed >= TRIAL_LIMITS.evaluationsTotal
  ) {
    return {
      allowed: false as const,
      code: "TRIAL_EVALUATIONS_USED",
      status: 402,
      message: "You’ve used your 5 free evaluations. Choose a plan to continue.",
      summary,
    };
  }

  if (
    kind === "evaluation_completed" &&
    summary.paidActive &&
    summary.monthlyEvaluationsUsed >= summary.limits.evaluationsPerMonth
  ) {
    return {
      allowed: false as const,
      code: "EVALUATION_LIMIT_REACHED",
      status: 402,
      message: "You’ve reached this month’s evaluation allowance. Upgrade your plan to continue.",
      summary,
    };
  }

  if (subjectKey && kind !== "evaluation_completed" && kind !== "provider_api_call") {
    const usedForVehicle = await countUsage(
      supabase,
      summary.company.companyId,
      kind,
      { subjectKey },
    );

    const perVehicleLimit = summary.trialActive && !summary.paidActive
      ? kind === "market_search"
        ? TRIAL_LIMITS.marketSearchesPerEvaluation
        : kind === "auto_dev_discovery"
          ? TRIAL_LIMITS.autoDevPerEvaluation
          : kind === "evaluation_summary"
            ? TRIAL_LIMITS.evaluationSummariesPerEvaluation
            : TRIAL_LIMITS.conditionAnalysesPerEvaluation
      : kind === "market_search"
        ? summary.limits.marketSearchesPerEvaluation
        : kind === "auto_dev_discovery"
          ? summary.limits.autoDevPerEvaluation
          : kind === "evaluation_summary"
            ? summary.limits.evaluationSummariesPerEvaluation
            : summary.limits.conditionAnalysesPerEvaluation;

    if (usedForVehicle + expectedUnits > perVehicleLimit) {
      return {
        allowed: false as const,
        code: "PER_EVALUATION_USAGE_LIMIT",
        status: 429,
        message:
          kind === "market_search"
            ? "This evaluation has reached its extended market-search allowance."
            : kind === "auto_dev_discovery"
              ? "This evaluation has reached its national-discovery allowance."
              : kind === "evaluation_summary"
                ? "This evaluation has reached its AI summary allowance."
                : "This evaluation has reached its AI condition-analysis allowance.",
        summary,
      };
    }
  }

  if (kind === "provider_api_call") {
    const providerLimit =
      summary.trialActive && !summary.paidActive
        ? TRIAL_LIMITS.providerCallsTotal
        : summary.limits.providerCallsPerMonth;

    if (summary.monthlyProviderCalls + expectedUnits > providerLimit) {
      return {
        allowed: false as const,
        code: "PROVIDER_SAFETY_LIMIT",
        status: 429,
        message:
          "This workspace has reached an internal provider safety limit. Existing evaluations remain available.",
        summary,
      };
    }
  }

  return { allowed: true as const, summary };
}

export async function recordUsageEvent(args: {
  supabase: SupabaseClient;
  companyId: string;
  userId?: string | null;
  kind: UsageKind;
  subjectKey?: string | null;
  units?: number;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await args.supabase.from("company_usage_events").insert({
    company_id: args.companyId,
    user_id: args.userId || null,
    event_type: args.kind,
    subject_key: args.subjectKey || null,
    units: Math.max(0, Math.round(args.units || 1)),
    idempotency_key: args.idempotencyKey || null,
    metadata: args.metadata || {},
  });

  if (error && error.code !== "23505") throw new Error(error.message);
}
