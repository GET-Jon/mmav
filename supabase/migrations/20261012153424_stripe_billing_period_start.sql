-- Track Stripe's actual billing-period boundary for subscription quota accounting.
-- Do not manufacture an anchor from updated_at or an approximate month subtraction.
-- Existing trial rows remain null; first customer.subscription.* webhook fills it.
alter table public.company_billing_accounts
  add column if not exists current_period_start timestamptz;

comment on column public.company_billing_accounts.current_period_start is
  'Authoritative period start from Stripe subscription or subscription-item current_period_start. Required for paid quota resets.';