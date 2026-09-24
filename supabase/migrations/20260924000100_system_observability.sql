-- Lot Logic system observability foundation.
-- Safe to deploy independently; application code degrades gracefully if this table is absent.

create table if not exists public.system_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_id uuid null references public.companies(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  trace_id text not null,
  subsystem text not null,
  event_name text not null,
  status text not null default 'ok' check (status in ('ok','warning','error')),
  duration_ms integer null check (duration_ms is null or duration_ms >= 0),
  evaluation_id uuid null references public.auction_evaluations(id) on delete set null,
  vehicle_id uuid null,
  message text null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists system_events_created_at_idx
  on public.system_events (created_at desc);
create index if not exists system_events_company_created_at_idx
  on public.system_events (company_id, created_at desc);
create index if not exists system_events_trace_id_idx
  on public.system_events (trace_id, created_at asc);
create index if not exists system_events_evaluation_id_idx
  on public.system_events (evaluation_id, created_at asc)
  where evaluation_id is not null;
create index if not exists system_events_subsystem_status_idx
  on public.system_events (subsystem, status, created_at desc);

alter table public.system_events enable row level security;

drop policy if exists "company admins can read system events" on public.system_events;
create policy "company admins can read system events"
on public.system_events
for select
to authenticated
using (
  exists (
    select 1
    from public.company_memberships cm
    where cm.company_id = system_events.company_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.role = 'company_admin'
  )
);

comment on table public.system_events is
  'Technical observability events for Lot Logic request/evaluation/workflow traces.';
