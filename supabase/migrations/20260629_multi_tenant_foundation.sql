-- Multi-tenant foundation for MMAV / Mindful Motors Auction Valuation
-- Phase 1: create tenant tables, company-scoped settings, and backfill existing saved evaluations.

create extension if not exists pgcrypto;

-- 1. Companies / tenants
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Platform-level super admins
create table if not exists public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id)
);

-- 3. Company memberships
create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('company_admin', 'user')),
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create index if not exists company_memberships_company_id_idx
  on public.company_memberships(company_id);

create index if not exists company_memberships_user_id_idx
  on public.company_memberships(user_id);

-- 4. Company-specific Rules & Defaults
create table if not exists public.company_assumptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  assumptions jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id)
);

-- 5. Company-specific API controls/settings
create table if not exists public.company_api_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null default 'marketcheck',
  live_lookup_enabled boolean not null default false,
  max_api_calls_per_search integer not null default 3 check (max_api_calls_per_search between 1 and 25),
  min_usable_comps_to_stop integer not null default 10 check (min_usable_comps_to_stop between 1 and 100),
  min_initial_regions integer not null default 2 check (min_initial_regions between 1 and 25),
  monthly_call_limit integer,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, provider)
);

-- 6. API usage events for company-level monitoring
create table if not exists public.api_usage_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  provider text not null,
  endpoint text,
  vehicle_year integer,
  vehicle_make text,
  vehicle_model text,
  api_calls_made integer not null default 0,
  cache_hit boolean not null default false,
  status integer,
  stop_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists api_usage_events_company_created_idx
  on public.api_usage_events(company_id, created_at desc);

-- 7. Add tenant ownership columns to saved_evaluations if that table exists
do $$
begin
  if to_regclass('public.saved_evaluations') is not null then
    alter table public.saved_evaluations
      add column if not exists company_id uuid references public.companies(id) on delete cascade;

    alter table public.saved_evaluations
      add column if not exists created_by uuid references auth.users(id) on delete set null;

    alter table public.saved_evaluations
      add column if not exists updated_by uuid references auth.users(id) on delete set null;

    create index if not exists saved_evaluations_company_id_idx
      on public.saved_evaluations(company_id);

    create index if not exists saved_evaluations_company_status_idx
      on public.saved_evaluations(company_id, status);
  end if;
end $$;

-- 8. Helper functions for RLS and app checks
create or replace function public.is_platform_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = check_user_id
  );
$$;

create or replace function public.is_company_member(check_company_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_platform_admin(check_user_id)
    or exists (
      select 1
      from public.company_memberships cm
      where cm.company_id = check_company_id
        and cm.user_id = check_user_id
        and cm.status = 'active'
    );
$$;

create or replace function public.is_company_admin(check_company_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_platform_admin(check_user_id)
    or exists (
      select 1
      from public.company_memberships cm
      where cm.company_id = check_company_id
        and cm.user_id = check_user_id
        and cm.status = 'active'
        and cm.role = 'company_admin'
    );
$$;

-- 9. Enable RLS on new tenant tables
alter table public.companies enable row level security;
alter table public.company_memberships enable row level security;
alter table public.platform_admins enable row level security;
alter table public.company_assumptions enable row level security;
alter table public.company_api_settings enable row level security;
alter table public.api_usage_events enable row level security;

-- NOTE:
-- Do not enable RLS on saved_evaluations in this migration yet.
-- We will do that after app routes are updated to pass company_id and enforce company context.

-- 10. Policies: companies
drop policy if exists "platform admins can manage companies" on public.companies;
create policy "platform admins can manage companies"
on public.companies
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "members can view their companies" on public.companies;
create policy "members can view their companies"
on public.companies
for select
using (public.is_company_member(id));

-- 11. Policies: memberships
drop policy if exists "platform admins can manage memberships" on public.company_memberships;
create policy "platform admins can manage memberships"
on public.company_memberships
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "company admins can manage company memberships" on public.company_memberships;
create policy "company admins can manage company memberships"
on public.company_memberships
for all
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));

drop policy if exists "members can view company memberships" on public.company_memberships;
create policy "members can view company memberships"
on public.company_memberships
for select
using (public.is_company_member(company_id));

-- 12. Policies: platform_admins
drop policy if exists "platform admins can view platform admins" on public.platform_admins;
create policy "platform admins can view platform admins"
on public.platform_admins
for select
using (public.is_platform_admin());

-- 13. Policies: company assumptions
drop policy if exists "members can view company assumptions" on public.company_assumptions;
create policy "members can view company assumptions"
on public.company_assumptions
for select
using (public.is_company_member(company_id));

drop policy if exists "company admins can manage company assumptions" on public.company_assumptions;
create policy "company admins can manage company assumptions"
on public.company_assumptions
for all
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));

-- 14. Policies: company API settings
drop policy if exists "members can view company api settings" on public.company_api_settings;
create policy "members can view company api settings"
on public.company_api_settings
for select
using (public.is_company_member(company_id));

drop policy if exists "company admins can manage company api settings" on public.company_api_settings;
create policy "company admins can manage company api settings"
on public.company_api_settings
for all
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));

-- 15. Policies: API usage events
drop policy if exists "members can view company api usage events" on public.api_usage_events;
create policy "members can view company api usage events"
on public.api_usage_events
for select
using (company_id is null or public.is_company_member(company_id));

drop policy if exists "members can insert company api usage events" on public.api_usage_events;
create policy "members can insert company api usage events"
on public.api_usage_events
for insert
with check (company_id is null or public.is_company_member(company_id));

-- 16. Backfill Mindful Motor Co. as first tenant
do $$
declare
  mindful_company_id uuid;
  admin_user_id uuid;
  admin_email text := 'jonathan@thisisget.com';
begin
  insert into public.companies (name, slug, status)
  values ('Mindful Motor Co.', 'mindful-motor-co', 'active')
  on conflict (slug) do update
    set name = excluded.name,
        status = 'active',
        updated_at = now()
  returning id into mindful_company_id;

  insert into public.company_api_settings (
    company_id,
    provider,
    live_lookup_enabled,
    max_api_calls_per_search,
    min_usable_comps_to_stop,
    min_initial_regions
  )
  values (
    mindful_company_id,
    'marketcheck',
    false,
    3,
    10,
    2
  )
  on conflict (company_id, provider) do nothing;

  if to_regclass('public.saved_evaluations') is not null then
    update public.saved_evaluations
    set company_id = mindful_company_id
    where company_id is null;
  end if;

  if admin_email <> 'jonathan@thisisget.com' then
    select id
    into admin_user_id
    from auth.users
    where lower(email) = lower(admin_email)
    limit 1;

    if admin_user_id is not null then
      insert into public.platform_admins (user_id)
      values (admin_user_id)
      on conflict (user_id) do nothing;

      insert into public.company_memberships (
        company_id,
        user_id,
        role,
        status
      )
      values (
        mindful_company_id,
        admin_user_id,
        'company_admin',
        'active'
      )
      on conflict (company_id, user_id) do update
        set role = 'company_admin',
            status = 'active',
            updated_at = now();
    end if;
  end if;
end $$;

-- 17. After backfill, make saved_evaluations.company_id required if table exists
do $$
begin
  if to_regclass('public.saved_evaluations') is not null then
    if not exists (
      select 1
      from public.saved_evaluations
      where company_id is null
    ) then
      alter table public.saved_evaluations
        alter column company_id set not null;
    end if;
  end if;
end $$;
