export const monthlyCheckoutPlans = {
  starter: { name: "Starter", amount: 2900 },
  dealer: { name: "Dealer", amount: 7900 },
  dealer_pro: { name: "Dealer Pro", amount: 14900 },
} as const;

export function addCheckoutPrice(params: URLSearchParams, planKey: keyof typeof monthlyCheckoutPlans, priceId?: string) {
  if (priceId) {
    params.set("line_items[0][price]", priceId);
    return;
  }
  const plan = monthlyCheckoutPlans[planKey];
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][unit_amount]", String(plan.amount));
  params.set("line_items[0][price_data][recurring][interval]", "month");
  params.set("line_items[0][price_data][product_data][name]", `Lot Logic ${plan.name}`);
}
