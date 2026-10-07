export const monthlyCheckoutPlans = {
  starter: { name: "Starter", amount: 2900 },
  dealer: { name: "Dealer", amount: 7900 },
  dealer_pro: { name: "Dealer Pro", amount: 14900 },
} as const;

export type BillingPlanKey = keyof typeof monthlyCheckoutPlans;

export function stripePriceIdForPlan(planKey: BillingPlanKey) {
  if (planKey === "dealer") {
    return process.env.STRIPE_DEALER_PRICE_ID || "";
  }

  if (planKey === "dealer_pro") {
    return process.env.STRIPE_DEALER_PRO_PRICE_ID || "";
  }

  return (
    process.env.STRIPE_STARTER_PRICE_ID ||
    process.env.STRIPE_DEFAULT_PRICE_ID ||
    ""
  );
}

export function isStripePlanConfigured(planKey: BillingPlanKey) {
  return Boolean(process.env.STRIPE_SECRET_KEY && stripePriceIdForPlan(planKey));
}

export function addCheckoutPrice(
  params: URLSearchParams,
  planKey: BillingPlanKey,
  priceId = stripePriceIdForPlan(planKey),
) {
  if (!priceId) {
    throw new Error(
      `Stripe price is not configured for the ${monthlyCheckoutPlans[planKey].name} plan.`,
    );
  }

  params.set("line_items[0][price]", priceId);
}
