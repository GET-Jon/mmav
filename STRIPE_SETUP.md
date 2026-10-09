# Lot Logic Stripe setup

Lot Logic uses three recurring monthly subscription plans. The application now
requires fixed Stripe Price IDs for each paid plan so Checkout, Customer Portal
plan changes, webhooks, and Lot Logic entitlements all reference the same
catalog.

## Products and prices

Create these in the same Stripe account used by `STRIPE_SECRET_KEY`:

| Product | Recurring price | Lot Logic entitlement |
| --- | ---: | --- |
| Lot Logic Starter | $29 / month | 20 completed evaluations / month, 1 seat |
| Lot Logic Dealer | $79 / month | 75 completed evaluations / month, 3 seats |
| Lot Logic Dealer Pro | $149 / month | 200 completed evaluations / month, 5 seats |

Copy each Stripe `price_...` ID into Netlify:

- `STRIPE_STARTER_PRICE_ID`
- `STRIPE_DEALER_PRICE_ID`
- `STRIPE_DEALER_PRO_PRICE_ID`

Also configure:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

`STRIPE_DEFAULT_PRICE_ID` remains supported as a Starter compatibility alias
but should not be needed once `STRIPE_STARTER_PRICE_ID` is set.

## Webhook

Production endpoint:

`https://yourlotlogic.com/api/billing/webhook`

Subscribe it to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Copy the webhook signing secret (`whsec_...`) to
`STRIPE_WEBHOOK_SECRET` in Netlify.

## Customer Portal

Enable Stripe Customer Portal for the production account and allow:

- customers to update payment methods;
- customers to view invoices;
- customers to cancel subscriptions;
- customers to switch among the Starter, Dealer, and Dealer Pro monthly prices.

For plan changes, use Stripe's normal proration behavior unless the business
chooses a different policy. Lot Logic treats the active Stripe Price ID as the
source of truth when the subscription webhook arrives, so portal upgrades and
downgrades update application entitlements automatically.

## Checkout behavior

Lot Logic Checkout:

- creates/reuses one Stripe Customer per dealership;
- starts a subscription using the selected fixed Price ID;
- attaches `company_id` and `plan_key` metadata;
- allows promotion codes;
- enables Stripe Automatic Tax and keeps the Stripe customer address current;
- returns the customer to the evaluator or Billing page;
- relies on Stripe webhooks to synchronize subscription status and entitlements.

## No evaluation top-ups yet

There is intentionally no Stripe product for extra evaluation credits. Current
conversion behavior is allowance counter -> Billing -> plan upgrade. Add-on
credit packs should only be added if real usage shows customers regularly need
small overages without needing the next plan.
