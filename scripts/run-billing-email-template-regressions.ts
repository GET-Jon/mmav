import assert from "node:assert/strict";
import { renderBillingEmail } from "../lib/email/billing-templates";

const types = ["activated", "payment_problem", "plan_changed", "cancellation_scheduled", "canceled"] as const;
for (const type of types) {
  const result = renderBillingEmail({
    type,
    companyName: "Example Dealership",
    planName: "Starter",
    effectiveDate: "November 30, 2026",
  });
  assert.ok(result.subject.startsWith("Your Lot Logic") || result.subject.includes("Lot Logic"), type);
  assert.ok(result.html.includes("LOT LOGIC"), type);
  assert.ok(result.html.includes("Example Dealership"), type);
  assert.ok(result.text.includes("support@yourlotlogic.com"), type);
  assert.ok(result.html.includes("https://yourlotlogic.com/"), type);
}
const escaped = renderBillingEmail({ type: "activated", companyName: "<script>alert(1)</script>", planName: "Starter" });
assert.ok(!escaped.html.includes("<script>"));
assert.ok(escaped.html.includes("&lt;script&gt;"));
assert.throws(() => renderBillingEmail({ type: "activated", companyName: "", planName: "Starter" }), /requires/);
console.log("Billing email design tests passed: 5 states, HTML escaping and validation.");
