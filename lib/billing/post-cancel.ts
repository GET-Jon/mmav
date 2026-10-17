/**
 * The cancellation window preserves ONLY unspent paid-plan evaluations.
 * Trial-rollover evaluations do not extend beyond the original paid cycle.
 * All timestamps are UTC instants; expiry is exclusive.
 */
export const POST_CANCEL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function cancellationBalance(input: {
  paidAllowance: number;
  evaluationsUsedInFinalPaidPeriod: number;
  endedAt: string | null | undefined;
}) {
  const endedMs = Date.parse(input.endedAt || "");
  if (!Number.isFinite(endedMs)) return null;
  const allowance = Math.max(0, Math.floor(input.paidAllowance));
  const used = Math.max(0, Math.floor(input.evaluationsUsedInFinalPaidPeriod));
  return {
    startsAt: new Date(endedMs).toISOString(),
    expiresAt: new Date(endedMs + POST_CANCEL_DAYS * DAY_MS).toISOString(),
    evaluations: Math.max(0, allowance - used),
  };
}

export function cancellationWindow(input: {
  status: string | null | undefined;
  startsAt: string | null | undefined;
  expiresAt: string | null | undefined;
  initialEvaluations: number | null | undefined;
  usedDuringWindow: number;
  now?: Date;
}) {
  const start = Date.parse(input.startsAt || "");
  const end = Date.parse(input.expiresAt || "");
  const now = (input.now ?? new Date()).getTime();
  const initial = Math.max(0, Math.floor(Number(input.initialEvaluations) || 0));
  const used = Math.max(0, Math.floor(Number(input.usedDuringWindow) || 0));
  const valid = input.status === "canceled" &&
    Number.isFinite(start) && Number.isFinite(end) &&
    end === start + POST_CANCEL_DAYS * DAY_MS;
  const active = valid && start <= now && now < end;
  return {
    valid,
    active,
    remaining: active ? Math.max(0, initial - used) : 0,
    initial: valid ? initial : 0,
    startsAt: valid ? new Date(start).toISOString() : null,
    expiresAt: valid ? new Date(end).toISOString() : null,
  };
}
