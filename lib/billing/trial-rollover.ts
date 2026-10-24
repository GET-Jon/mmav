/**
 * One-time carryover of unused free-trial evaluations into the FIRST Stripe
 * billing period. Do not add this to non-expiring platform-gifted credits.
 */
export const FREE_TRIAL_EVALUATIONS = 5;
export const FREE_TRIAL_DAYS = 14;

export function firstPeriodTrialRollover(input: {
  companyCreatedAt: string | null | undefined;
  firstPeriodStart: string | null | undefined;
  trialEvaluationsUsed: number;
}): number {
  const joined = Date.parse(input.companyCreatedAt || "");
  const periodStart = Date.parse(input.firstPeriodStart || "");
  if (!Number.isFinite(joined) || !Number.isFinite(periodStart)) return 0;

  // Carryover applies only if the first subscription was started during
  // the original 14-day trial. An expired trial has no remaining balance.
  if (periodStart < joined || periodStart > joined + FREE_TRIAL_DAYS * 86_400_000) {
    return 0;
  }

  const used = Number.isFinite(input.trialEvaluationsUsed)
    ? Math.max(0, Math.floor(input.trialEvaluationsUsed))
    : FREE_TRIAL_EVALUATIONS;
  return Math.max(0, FREE_TRIAL_EVALUATIONS - used);
}

export function trialRolloverForPeriod(input: {
  firstPeriodStart: string | null | undefined;
  currentPeriodStart: string | null | undefined;
  carryoverEvaluations: number | null | undefined;
}): number {
  const stored = Date.parse(input.firstPeriodStart || "");
  const current = Date.parse(input.currentPeriodStart || "");
  if (!Number.isFinite(stored) || !Number.isFinite(current) || stored !== current) return 0;
  const credits = Number(input.carryoverEvaluations);
  return Number.isFinite(credits)
    ? Math.max(0, Math.min(FREE_TRIAL_EVALUATIONS, Math.floor(credits)))
    : 0;
}

export function remainingTrialRollover(input: {
  monthlyAllowance: number;
  carryover: number;
  periodEvaluationsUsed: number;
}): number {
  const allowance = Math.max(0, Math.floor(input.monthlyAllowance));
  const carryover = Math.max(0, Math.floor(input.carryover));
  const used = Math.max(0, Math.floor(input.periodEvaluationsUsed));
  return Math.max(0, Math.min(carryover, allowance + carryover - used));
}
