-- Preserve unused evaluations from the initial 14-day trial in the
-- first paid Stripe billing period ONLY (not a perpetual gifted balance).
-- Safe to replay; first-period anchor prevents regrant on renewal/upgrades.
alter table public.company_billing_accounts
  add column if not exists trial_rollover_evaluations integer not null default 0
    check (trial_rollover_evaluations between 0 and 5),
  add column if not exists trial_rollover_period_start timestamptz;

alter table public.company_billing_accounts
  add constraint trial_rollover_period_required
  check (trial_rollover_evaluations = 0 or trial_rollover_period_start is not null);

-- Backfill customers who activated their first paid plan during their original
-- 14-day trial, including in-progress isolated Stripe checkout tests. There is
-- no separate credit balance: this bonus is valid only for the anchored period.
with first_paid as (
  select
    b.company_id,
    b.current_period_start,
    greatest(
      0,
      5 - least(5, coalesce((
        select sum(ue.units)::integer
        from public.company_usage_events ue
        where ue.company_id = b.company_id
          and ue.event_type = 'evaluation_completed'
          and ue.created_at < b.current_period_start
      ), 0))
    ) as unused_trial_evaluations
  from public.company_billing_accounts b
  join public.companies c on c.id = b.company_id
  where b.stripe_subscription_id is not null
    and b.status in ('active', 'past_due')
    and b.current_period_start >= c.created_at
    and b.current_period_start <= c.created_at + interval '14 days'
    and b.current_period_end > now()
    and b.trial_rollover_period_start is null
)
update public.company_billing_accounts b
set trial_rollover_evaluations = p.unused_trial_evaluations,
    trial_rollover_period_start = p.current_period_start
from first_paid p
where b.company_id = p.company_id
  and b.trial_rollover_period_start is null;
