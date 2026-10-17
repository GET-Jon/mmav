# Stripe test subscription checklist (PR #19)

This is a **test-mode-only** checkout and webhook rehearsal. Never paste API
keys, service-role keys, or webhook secrets into GitHub, chat, screenshots, or
public logs. **Do not use production Supabase for the preview test.**

## 1. Isolate Supabase

Create an MMAV Supabase development branch from the Lot Logic project
(`ymlleqpbpgzydyzwhlqq`) after the organization/cost confirmation.
Development branches do not carry production user or billing data. Confirm
the branch has the `company_billing_accounts.current_period_start` column,
including applied migrations.

Use fresh test-user credentials in the branch. Never copy existing production
Stripe customer IDs or subscription IDs into test accounts.

## 2. Deploy-preview environment (Netlify site: mmav)

In Netlify site settings, configure **Deploy Previews only** (not Production
or All contexts) with these values, using the new Supabase branch and Stripe
**Test Mode** account:

| Name | Required meaning |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase *development branch* URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Development branch public anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Development branch service-role key (secret; server/functions only) |
| `STRIPE_SECRET_KEY` | **sk_test_** key (secret; server/functions only) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret from the *test-mode preview webhook* (secret; server/functions only) |
| `STRIPE_STARTER_PRICE_ID` | Test recurring $29/month price |
| `STRIPE_DEALER_PRICE_ID` | Test recurring $79/month price |
| `STRIPE_DEALER_PRO_PRICE_ID` | Test recurring $149/month price |

For Netlify, values needed in Next.js browser bundles must also be available at
**build time** (the `NEXT_PUBLIC_` variables). Secrets must be available at
**function runtime**. Redeploy the PR preview after changing variables.

PR #19 additionally blocks preview Checkout/Portal/webhooks when the Stripe
key is not `sk_test_` or the Supabase URL points to production.

## 3. Stripe Test Mode

In Stripe's test-mode dashboard:

1. Create or verify the three monthly recurring prices shown above, and
   save their actual test Price IDs in the Deploy Preview context.
2. Configure a test webhook endpoint for
   `https://deploy-preview-19--mmav.netlify.app/api/billing/webhook`.
   Subscribe to `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.paid`, and
   `invoice.payment_failed`.
3. Store **that endpoint's** `whsec_` signing secret in deploy-preview
   `STRIPE_WEBHOOK_SECRET`. The production webhook must stay unchanged.
4. Check automatic tax configuration, Customer Portal configuration, and
   Stripe account test-mode readiness; these are account-side settings and
   cannot be established from source code alone.

## 4. Run verification

1. Sign up or sign in as a **fresh branch-only test dealership admin**.
2. In preview billing, buy Starter with a **Stripe test card only**.
3. Confirm a test-only Stripe customer, invoice, and subscription.
4. Verify webhook processing in the **branch database's**
   `billing_events` and `company_billing_accounts`. Expect
   `stripe_subscription_id`, `current_period_start`, and
   `current_period_end` set by a signed subscription webhook.
5. Verify `company_entitlements` grants Starter (20 evaluations/month,
   1 seat) and that the UI displays the subscription's actual renewal date.
6. Verify that earlier trial evaluations do **not** consume paid allowance.
   A Stripe test-clock or appropriate controlled renewal scenario should
   confirm allowance resets at the actual next billing-period boundary,
   **not** on the first of a calendar month.
7. Use Stripe Test Mode Customer Portal to verify plan changes, cancellation,
   and failed-payment behavior; check signed webhook/event results after each.
8. Confirm the **production** Supabase billing tables have no new test
   subscriptions or `livemode:false` events.

Keep PR #19 draft until test-mode checkout, webhook state, and renewal checks
pass. After the actual Stripe production account/settings are verified, merge
the PR and then do one controlled **real** payment test in production.
