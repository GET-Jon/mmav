-- Lot Logic Inventory Operations — immutable operational History.
-- History is append-only. It records what happened without becoming mutable state.

create table public.mindful_inventory_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  vehicle_id uuid not null references public.mindful_inventory_vehicles(id) on delete cascade,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_partner_id uuid references public.mindful_inventory_partners(id) on delete set null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (
    actor_user_id is null
    or actor_partner_id is null
  )
);

create index mindful_inventory_history_vehicle_created_idx
  on public.mindful_inventory_history(vehicle_id, created_at desc);

create index mindful_inventory_history_company_created_idx
  on public.mindful_inventory_history(company_id, created_at desc);

create index mindful_inventory_history_entity_idx
  on public.mindful_inventory_history(entity_type, entity_id, created_at desc)
  where entity_type is not null and entity_id is not null;

create index mindful_inventory_history_event_type_idx
  on public.mindful_inventory_history(vehicle_id, event_type, created_at desc);

create or replace function public.prevent_mindful_inventory_history_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Inventory History is immutable.';
end;
$$;

create trigger mindful_inventory_history_immutable_trigger
before update or delete on public.mindful_inventory_history
for each row execute function public.prevent_mindful_inventory_history_mutation();

alter table public.mindful_inventory_history enable row level security;
