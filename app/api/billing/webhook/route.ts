import { NextRequest, NextResponse } from "next/server";

import {
  stringValue,
  unixToIso,
  verifyStripeWebhook,
} from "@/lib/billing/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { firstPeriodTrialRollover } from "@/lib/billing/trial-rollover";
import { shouldMarkInvoicePastDue, shouldSyncSubscriptionStatus } from "@/lib/billing/payment-status";
import {
  configuredStripeLiveMode,
  currentPreviewBillingIsolation,
} from "@/lib/billing/preview-isolation";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function firstSubscriptionPriceId(subscription: JsonRecord) {
  const items = record(subscription.items);
  const data = Array.isArray(items.data) ? items.data : [];
  const first = record(data[0]);
  const price = record(first.price);
  return stringValue(price.id);
}

function subscriptionPeriodStart(subscription: JsonRecord) {
  const direct = unixToIso(subscription.current_period_start);
  if (direct) return direct;

  // Newer Stripe subscription API versions expose billing periods on items.
  const items = record(subscription.items);
  const data = Array.isArray(items.data) ? items.data : [];
  const first = record(data[0]);
  return unixToIso(first.current_period_start);
}

function subscriptionPeriodEnd(subscription: JsonRecord) {
  const direct = unixToIso(subscription.current_period_end);
  if (direct) return direct;

  const items = record(subscription.items);
  const data = Array.isArray(items.data) ? items.data : [];
  const first = record(data[0]);
  return unixToIso(first.current_period_end);
}


function planKeyForSubscription(subscription: JsonRecord) {
  // The active Stripe price is authoritative. Customer Portal plan changes do
  // not reliably rewrite custom subscription metadata, so reading metadata
  // first can leave Lot Logic on the old entitlement after an upgrade.
  const priceId = firstSubscriptionPriceId(subscription);
  if (priceId && priceId === process.env.STRIPE_DEALER_PRICE_ID) return "dealer";
  if (priceId && priceId === process.env.STRIPE_DEALER_PRO_PRICE_ID) return "dealer_pro";
  if (
    priceId &&
    (priceId === process.env.STRIPE_STARTER_PRICE_ID ||
      priceId === process.env.STRIPE_DEFAULT_PRICE_ID)
  ) {
    return "starter";
  }

  // A present but unknown Stripe Price ID must never inherit a higher plan
  // from stale metadata. Fail closed to Starter until the price is explicitly
  // configured in Lot Logic.
  if (priceId) return "starter";

  const metadata = record(subscription.metadata);
  const metadataPlan = stringValue(metadata.plan_key);
  if (
    metadataPlan === "starter" ||
    metadataPlan === "dealer" ||
    metadataPlan === "dealer_pro"
  ) {
    return metadataPlan;
  }

  // Unknown prices should not accidentally grant a higher entitlement.
  return "starter";
}

function planEntitlements(planKey: string) {
  if (planKey === "dealer_pro") {
    return { evaluations_per_month: 200, seats_limit: 5 };
  }
  if (planKey === "dealer") {
    return { evaluations_per_month: 75, seats_limit: 3 };
  }
  return { evaluations_per_month: 20, seats_limit: 1 };
}

async function companyIdFromCustomer(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  customerId: string | null,
) {
  if (!customerId) return null;
  const { data } = await admin
    .from("company_billing_accounts")
    .select("company_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  return data?.company_id ? String(data.company_id) : null;
}

export async function POST(request: NextRequest) {
  const isolation = currentPreviewBillingIsolation();
  if (!isolation.safe) {
    return NextResponse.json(
      { error: isolation.reason || "Preview billing is not isolated." },
      { status: 503 },
    );
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!verifyStripeWebhook(payload, signature)) {
    return NextResponse.json(
      { error: "Invalid Stripe signature." },
      { status: 400 },
    );
  }

  const event = JSON.parse(payload) as JsonRecord;
  const eventId = stringValue(event.id);
  const eventType = stringValue(event.type);
  const eventData = record(event.data);
  const object = record(eventData.object);
  const expectedLiveMode = configuredStripeLiveMode();
  if (
    expectedLiveMode === null ||
    typeof event.livemode !== "boolean" ||
    event.livemode !== expectedLiveMode
  ) {
    return NextResponse.json(
      { error: "Stripe event mode does not match the configured billing environment." },
      { status: 400 },
    );
  }

  if (!eventId || !eventType) {
    return NextResponse.json({ error: "Malformed Stripe event." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("billing_events")
    .select("stripe_event_id")
    .eq("stripe_event_id", eventId)
    .maybeSingle();

  if (existing?.stripe_event_id) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const metadata = record(object.metadata);
  const metadataCompanyId = stringValue(metadata.company_id);
  const customerId = stringValue(object.customer);
  let companyId = metadataCompanyId || (await companyIdFromCustomer(admin, customerId));

  if (eventType === "checkout.session.completed") {
    const clientReferenceId = stringValue(object.client_reference_id);
    companyId = companyId || clientReferenceId;

    if (companyId) {
      const { error } = await admin
        .from("company_billing_accounts")
        .upsert(
          {
            company_id: companyId,
            stripe_customer_id: customerId,
            stripe_subscription_id: stringValue(object.subscription),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id" },
        );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  if (eventType.startsWith("customer.subscription.")) {
    const subscriptionId = stringValue(object.id);
    const subscriptionMetadata = record(object.metadata);
    companyId =
      stringValue(subscriptionMetadata.company_id) ||
      companyId ||
      (await companyIdFromCustomer(admin, customerId));

    if (companyId && shouldSyncSubscriptionStatus(stringValue(object.status))) {
      const planKey = planKeyForSubscription(object);
      const entitlements = planEntitlements(planKey);
      const rawStatus = stringValue(object.status) || "not_configured";
      const periodStart = subscriptionPeriodStart(object);
      const periodEnd = subscriptionPeriodEnd(object);
      // An active Stripe subscription without both period boundaries cannot
      // be used to replenish paid usage; return retryable failure so Stripe
      // resends it instead of silently reverting to calendar-month resets.
      if (
        ["active", "trialing", "past_due", "unpaid", "paused"].includes(rawStatus) &&
        (!periodStart || !periodEnd || periodStart >= periodEnd)
      ) {
        return NextResponse.json(
          { error: "Stripe subscription event is missing a valid billing period." },
          { status: 503 },
        );
      }

      const { data: currentBilling, error: currentBillingError } = await admin
        .from("company_billing_accounts")
        .select("current_period_start,stripe_subscription_id,trial_rollover_period_start")
        .eq("company_id", companyId)
        .maybeSingle();
      if (currentBillingError) {
        return NextResponse.json({ error: currentBillingError.message }, { status: 500 });
      }
      // A delayed older webhook must not rewind the company's quota window.
      const oldStart = currentBilling?.current_period_start
        ? new Date(currentBilling.current_period_start).getTime()
        : null;
      const newStart = periodStart ? new Date(periodStart).getTime() : null;
      const stalePeriod = oldStart !== null && newStart !== null &&
        oldStart > newStart &&
        (!currentBilling?.stripe_subscription_id ||
          currentBilling.stripe_subscription_id === subscriptionId);
      if (stalePeriod) {
        const { error: staleEventError } = await admin.from("billing_events").insert({
          stripe_event_id: eventId,
          company_id: companyId,
          event_type: eventType,
          stripe_object_id: stringValue(object.id),
          metadata: { livemode: Boolean(event.livemode), ignored: "older_period" },
        });
        if (staleEventError) {
          return NextResponse.json({ error: staleEventError.message }, { status: 500 });
        }
        return NextResponse.json({ received: true, ignored: "older_period" });
      }
      const mappedStatus =
        rawStatus === "incomplete" || rawStatus === "incomplete_expired"
          ? "unpaid"
          : rawStatus === "active" ||
              rawStatus === "trialing" ||
              rawStatus === "past_due" ||
              rawStatus === "unpaid" ||
              rawStatus === "paused" ||
              rawStatus === "canceled"
            ? rawStatus
            : "not_configured";

      const { error } = await admin
        .from("company_billing_accounts")
        .upsert(
          {
            company_id: companyId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            status: mappedStatus,
            plan_key: planKey,
            stripe_price_id: firstSubscriptionPriceId(object),
            trial_ends_at: unixToIso(object.trial_end),
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: Boolean(object.cancel_at_period_end),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id" },
        );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const { error: entitlementError } = await admin
        .from("company_entitlements")
        .upsert(
          {
            company_id: companyId,
            plan_key: planKey,
            evaluations_per_month: entitlements.evaluations_per_month,
            seats_limit: entitlements.seats_limit,
            auto_dev_enabled: true,
            inventory_enabled: false,
            insights_enabled: true,
            advanced_market_expansion_enabled: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id" },
        );

      if (entitlementError) {
        return NextResponse.json({ error: entitlementError.message }, { status: 500 });
      }

      // Record unused free-trial evaluations once, only when Stripe first
      // confirms an active paid subscription. The credit is tied to this
      // first billing period rather than adding to non-expiring gifts.
      // A conditional update makes retries and competing events idempotent.
      if (
        rawStatus === "active" &&
        periodStart &&
        !currentBilling?.trial_rollover_period_start
      ) {
        const { data: companyRow, error: companyLookupError } = await admin
          .from("companies")
          .select("created_at")
          .eq("id", companyId)
          .single();
        if (companyLookupError) {
          return NextResponse.json({ error: companyLookupError.message }, { status: 500 });
        }

        const { data: trialEvaluations, error: trialUsageError } = await admin
          .from("company_usage_events")
          .select("units")
          .eq("company_id", companyId)
          .eq("event_type", "evaluation_completed")
          .lt("created_at", periodStart);
        if (trialUsageError) {
          return NextResponse.json({ error: trialUsageError.message }, { status: 500 });
        }

        const trialUsed = (trialEvaluations || []).reduce(
          (sum, row) => sum + Number(row.units || 0),
          0,
        );
        const carryover = firstPeriodTrialRollover({
          companyCreatedAt: companyRow?.created_at,
          firstPeriodStart: periodStart,
          trialEvaluationsUsed: trialUsed,
        });

        const { error: rolloverError } = await admin
          .from("company_billing_accounts")
          .update({
            trial_rollover_evaluations: carryover,
            trial_rollover_period_start: periodStart,
          })
          .eq("company_id", companyId)
          .eq("stripe_subscription_id", subscriptionId)
          .is("trial_rollover_period_start", null);
        if (rolloverError) {
          return NextResponse.json({ error: rolloverError.message }, { status: 500 });
        }
      }
    }
  }

  if (eventType === "invoice.payment_failed" && companyId) {
    const { data: existingBilling, error: billingLookupError } = await admin
      .from("company_billing_accounts")
      .select("status,stripe_subscription_id")
      .eq("company_id", companyId)
      .maybeSingle();
    if (billingLookupError) {
      return NextResponse.json({ error: billingLookupError.message }, { status: 500 });
    }

    // Stripe Checkout can create an incomplete subscription and emit an invoice
    // failure even though the customer never paid. Don't replace the free trial
    // with past_due or give that attempted plan's monthly allowance.
    const invoiceSubscriptionId =
      stringValue(object.subscription) ||
      stringValue(record(record(object.parent).subscription_details).subscription);
    const matchesCurrentSubscription =
      !invoiceSubscriptionId ||
      existingBilling?.stripe_subscription_id === invoiceSubscriptionId;

    if (
      existingBilling &&
      shouldMarkInvoicePastDue(String(existingBilling.status)) &&
      matchesCurrentSubscription
    ) {
      const { error: failureUpdateError } = await admin
        .from("company_billing_accounts")
        .update({
          status: "past_due",
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId)
        .in("status", ["active", "past_due"]);
      if (failureUpdateError) {
        return NextResponse.json({ error: failureUpdateError.message }, { status: 500 });
      }
    }
  }

  if (eventType === "invoice.paid" && companyId) {
    const { data: billing } = await admin
      .from("company_billing_accounts")
      .select("status")
      .eq("company_id", companyId)
      .maybeSingle();

    if (billing?.status === "past_due" || billing?.status === "unpaid") {
      await admin
        .from("company_billing_accounts")
        .update({
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId);
    }
  }

  const { error: eventError } = await admin.from("billing_events").insert({
    stripe_event_id: eventId,
    company_id: companyId,
    event_type: eventType,
    stripe_object_id: stringValue(object.id),
    metadata: {
      livemode: Boolean(event.livemode),
    },
  });

  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
