/**
 * Paid API usage is available only after a confirmed active subscription or
 * an explicitly comped internal account. A failed Stripe invoice is not
 * proof that an initial subscription was paid.
 */
export function allowsPaidEvaluationAccess(status: string) {
  return status === "active" || status === "comped";
}

/**
 * Stripe can emit customer.subscription.created(status=incomplete) after a
 * declined Checkout attempt. Keep the local free trial untouched until a
 * subscription reaches a billable/valid state, rather than replacing it with
 * an unpaid Dealer/Dealer Pro entitlement.
 */
export function shouldSyncSubscriptionStatus(status: string | null) {
  return Boolean(status && status !== "incomplete" && status !== "incomplete_expired");
}

/**
 * A failed invoice transitions an already active recurring subscription into
 * collections. An incomplete first Checkout must not become past_due.
 */
export function shouldMarkInvoicePastDue(currentStatus: string) {
  return currentStatus === "active" || currentStatus === "past_due";
}
