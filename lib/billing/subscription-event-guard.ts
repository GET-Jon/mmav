/**
 * An older Stripe event must not replace the subscription currently linked
 * to a dealership. Canceled Stripe subscriptions cannot be reactivated;
 * a genuine resubscription uses a NEW subscription ID.
 */
export function ignoreSubscriptionEvent(input: {
  storedSubscriptionId: string | null | undefined;
  incomingSubscriptionId: string | null | undefined;
  storedStatus: string | null | undefined;
  incomingStatus: string | null | undefined;
}) {
  const stored = input.storedSubscriptionId || "";
  const incoming = input.incomingSubscriptionId || "";
  const status = input.storedStatus || "";
  const next = input.incomingStatus || "";
  if (!incoming) return true;
  if (!stored) return false;

  if (stored === incoming) {
    return status === "canceled" && next !== "canceled";
  }

  // Always ignore deletion/failure for a subscription other than the one
  // currently linked. Otherwise old webhooks could end a new paid plan.
  if (["canceled", "past_due", "unpaid", "paused"].includes(next)) return true;

  // A previously canceled account may begin a completely new subscription.
  // An initial free trial can likewise be converted to a new paid plan.
  return status !== "canceled" && status !== "trialing";
}

export function invoiceBelongsToCurrentSubscription(input: {
  invoiceSubscriptionId: string | null | undefined;
  storedSubscriptionId: string | null | undefined;
}) {
  return Boolean(
    input.invoiceSubscriptionId &&
    input.storedSubscriptionId &&
    input.invoiceSubscriptionId === input.storedSubscriptionId,
  );
}
