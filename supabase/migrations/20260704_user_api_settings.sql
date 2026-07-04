-- User-level API preferences for MMAV.
-- Company-level API settings remain available as future company guardrails.

create table if not exists public.user_api_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'marketcheck',
  live_lookup_enabled boolean not null default false,
  max_api_calls_per_search integer not null default 1 check (max_api_calls_per_search between 1 and 25),
  min_usable_comps_to_stop integer not null default 10 check (min_usable_comps_to_stop between 1 and 100),
  min_initial_regions integer not null default 1 check (min_initial_regions between 1 and 25),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id, provider)
);

create index if not exists user_api_settings_company_user_idx
  on public.user_api_settings(company_id, user_id);

alter table public.user_api_settings enable row level security;

drop policy if exists "users can view their own api settings" on public.user_api_settings;
create policy "users can view their own api settings"
on public.user_api_settings
for select
using (
  user_id = auth.uid()
  and public.is_company_member(company_id)
);

drop policy if exists "users can manage their own api settings" on public.user_api_settings;
create policy "users can manage their own api settings"
on public.user_api_settings
for all
using (
  user_id = auth.uid()
  and public.is_company_member(company_id)
)
with check (
  user_id = auth.uid()
  and public.is_company_member(company_id)
);
