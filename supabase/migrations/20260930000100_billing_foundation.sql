-- Lot Logic billing foundation.
-- Billing belongs to the company/tenant, not an individual user.

create table if not exists public.company_billing_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'not_configured'
    check (status in (
      'not_configured',
      'trialing',
      'active',
      'past_due',
      'unpaid',
      'paused',
      'canceled',
      'comped'
    )),
  plan_key text not null default 'starter',
  stripe_price_id text,
  seats integer not null default 1 check (seats >= 1),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_billing_accounts_status_idx
  on public.company_billing_accounts(status);

create table if not exists public.company_entitlements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  plan_key text not null default 'starter',
  evaluations_per_month integer,
  seats_limit integer,
  auto_dev_enabled boolean not null default true,
  inventory_enabled boolean not null default true,
  insights_enabled boolean not null default true,
  advanced_market_expansion_enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_events (
  stripe_event_id text primary key,
  company_id uuid references public.companies(id) on delete set null,
  event_type text not null,
  stripe_object_id text,
  metadata jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now()
);

create index if not exists billing_events_company_processed_idx
  on public.billing_events(company_id, processed_at desc);

alter table public.company_billing_accounts enable row level security;
alter table public.company_entitlements enable row level security;
alter table public.billing_events enable row level security;

drop policy if exists "members can view company billing" on public.company_billing_accounts;
create policy "members can view company billing"
on public.company_billing_accounts
for select
using (public.is_company_member(company_id));

drop policy if exists "members can view company entitlements" on public.company_entitlements;
create policy "members can view company entitlements"
on public.company_entitlements
for select
using (public.is_company_member(company_id));

drop policy if exists "company admins can view billing events" on public.billing_events;
create policy "company admins can view billing events"
on public.billing_events
for select
using (company_id is not null and public.is_company_admin(company_id));

grant select on table public.company_billing_accounts to authenticated;
grant select on table public.company_entitlements to authenticated;
grant select on table public.billing_events to authenticated;

-- Server-side billing and onboarding routes use the Supabase service role.
-- Explicit grants are required in addition to RLS bypass privileges.
grant all on table public.company_billing_accounts to service_role;
grant all on table public.company_entitlements to service_role;
grant all on table public.billing_events to service_role;

-- Seed a neutral entitlement row for every existing company.
insert into public.company_entitlements (
  company_id,
  plan_key,
  evaluations_per_month,
  seats_limit,
  auto_dev_enabled,
  inventory_enabled,
  insights_enabled,
  advanced_market_expansion_enabled
)
select
  id,
  'starter',
  null,
  null,
  true,
  true,
  true,
  true
from public.companies
on conflict (company_id) do nothing;

insert into public.company_billing_accounts (
  company_id,
  status,
  plan_key
)
select
  id,
  'not_configured',
  'starter'
from public.companies
on conflict (company_id) do nothing;
