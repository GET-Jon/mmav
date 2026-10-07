import { NextRequest, NextResponse } from "next/server";

import {
  stringValue,
  unixToIso,
  verifyStripeWebhook,
} from "@/lib/billing/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

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

    if (companyId) {
      const planKey = planKeyForSubscription(object);
      const entitlements = planEntitlements(planKey);
      const rawStatus = stringValue(object.status) || "not_configured";
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
            current_period_end: subscriptionPeriodEnd(object),
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
    }
  }

  if (eventType === "invoice.payment_failed" && companyId) {
    await admin
      .from("company_billing_accounts")
      .update({
        status: "past_due",
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId);
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
