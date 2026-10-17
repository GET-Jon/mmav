-- One fixed balance of unused paid-plan evaluations for 30 days after
-- the final paid subscription period ends. Free-trial bonuses do not roll over.
-- Never award these fields for a trial, failed payment or unpaid subscription.
alter table public.company_billing_accounts
  add column if not exists post_cancel_evaluations integer not null default 0
    check (post_cancel_evaluations >= 0 and post_cancel_evaluations <= 200),
  add column if not exists post_cancel_starts_at timestamptz,
  add column if not exists post_cancel_expires_at timestamptz;

-- Exact 30-day window, never an arbitrary non-expiring credit balance.
alter table public.company_billing_accounts
  add constraint post_cancel_window_consistent
  check (
    (post_cancel_starts_at is null and post_cancel_expires_at is null and post_cancel_evaluations = 0)
    or
    (post_cancel_starts_at is not null and post_cancel_expires_at = post_cancel_starts_at + interval '30 days')
  );
