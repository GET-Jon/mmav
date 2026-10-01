-- Metered product usage for trials, plans, and provider safety limits.

create table if not exists public.company_usage_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  subject_key text,
  units integer not null default 1 check (units >= 0),
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists company_usage_events_idempotency_idx
  on public.company_usage_events(company_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists company_usage_events_company_type_created_idx
  on public.company_usage_events(company_id, event_type, created_at desc);

create index if not exists company_usage_events_company_subject_type_idx
  on public.company_usage_events(company_id, subject_key, event_type, created_at desc);

alter table public.company_usage_events enable row level security;

drop policy if exists "members can view company usage" on public.company_usage_events;
create policy "members can view company usage"
on public.company_usage_events
for select
using (public.is_company_member(company_id));

grant select on table public.company_usage_events to authenticated;
grant all on table public.company_usage_events to service_role;
