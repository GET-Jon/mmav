/**
 * Billing allowances belong to Stripe subscription periods, not calendar months.
 * Return an explicit unsynchronized state instead of creating free allowance at
 * midnight on the first of a calendar month.
 */
export type UsageWindow = {
  kind: "stripe" | "calendar" | "unsynchronized";
  start: string | null;
  end: string | null;
};

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function calendarMonthWindow(now: Date): UsageWindow {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    kind: "calendar",
    start: new Date(Date.UTC(year, month, 1)).toISOString(),
    end: new Date(Date.UTC(year, month + 1, 1)).toISOString(),
  };
}

export function resolvePaidUsageWindow(input: {
  stripeSubscriptionId: string | null | undefined;
  currentPeriodStart: string | null | undefined;
  currentPeriodEnd: string | null | undefined;
  now?: Date;
}): UsageWindow {
  const now = input.now ?? new Date();
  if (!input.stripeSubscriptionId) {
    // Manually comped subscriptions have no Stripe cycle. They retain the
    // calendar-based allowance unless an actual Stripe subscription exists.
    return calendarMonthWindow(now);
  }

  const start = parseDate(input.currentPeriodStart);
  const end = parseDate(input.currentPeriodEnd);
  if (
    !start || !end ||
    start.getTime() >= end.getTime() ||
    start.getTime() > now.getTime() ||
    now.getTime() >= end.getTime()
  ) {
    return { kind: "unsynchronized", start: null, end: null };
  }

  return {
    kind: "stripe",
    start: start.toISOString(),
    end: end.toISOString(),
  };
}
