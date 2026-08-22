-- Inventory Overview / Intake foundation.
--
-- Product model:
--   Lot Logic purchase -> Overview / Intake -> Mechanical Inspection
--
-- This migration establishes three invariants before the UI is rebuilt:
--   1. Inventory preserves the complete Lot Logic evaluation at purchase time.
--   2. A Vehicle Owner must be an active member of the vehicle's company.
--   3. Owner-requested Upgrades are first-class proposed intent, not Work Orders.

alter table public.mindful_inventory_vehicles
  add column if not exists transport_cost numeric(12,2) not null default 0
    check (transport_cost >= 0);

-- Preserve the complete evaluator row in addition to the normalized snapshot
-- already created by purchase_evaluation_and_add_to_inventory(). The evaluator
-- table is intentionally absent from some local Inventory-only reset chains, so
-- the lookup is dynamic and conditional.
create or replace function public.capture_inventory_lot_logic_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  evaluation_snapshot jsonb;
begin
  if new.source_evaluation_id is null then
    return new;
  end if;

  if to_regclass('public.auction_evaluations') is null then
    return new;
  end if;

  execute
    'select to_jsonb(e)
       from public.auction_evaluations e
      where e.id = $1
      limit 1'
  into evaluation_snapshot
  using new.source_evaluation_id;

  if evaluation_snapshot is not null then
    new.source_snapshot :=
      coalesce(new.source_snapshot, '{}'::jsonb)
      || jsonb_build_object(
        'lotLogicEvaluationSnapshot', evaluation_snapshot,
        'lotLogicSnapshotCapturedAt', now()
      );
  end if;

  return new;
end;
$$;

drop trigger if exists mindful_inventory_capture_lot_logic_snapshot
  on public.mindful_inventory_vehicles;

create trigger mindful_inventory_capture_lot_logic_snapshot
before insert on public.mindful_inventory_vehicles
for each row
execute function public.capture_inventory_lot_logic_snapshot();

-- Vehicle Owner is an internal Mindful/company responsibility in v1. Keep the
-- FK to auth.users for future expansion, but reject ownership by users who are
-- not currently active members of the same tenant.
create or replace function public.validate_inventory_vehicle_owner_membership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.project_owner_user_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = new.company_id
      and membership.user_id = new.project_owner_user_id
      and membership.status = 'active'
  ) then
    raise exception 'Vehicle Owner must be an active member of this company.';
  end if;

  return new;
end;
$$;

drop trigger if exists mindful_inventory_validate_vehicle_owner
  on public.mindful_inventory_vehicles;

create trigger mindful_inventory_validate_vehicle_owner
before insert or update of company_id, project_owner_user_id
on public.mindful_inventory_vehicles
for each row
execute function public.validate_inventory_vehicle_owner_membership();

create table public.mindful_inventory_upgrades (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  vehicle_id uuid not null references public.mindful_inventory_vehicles(id) on delete cascade,

  requested_by_user_id uuid references auth.users(id) on delete set null,

  title text not null check (length(trim(title)) > 0),
  description text,
  category text not null default 'other',
  desired_outcome text,

  manufacturer text,
  part_number text,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  preferred_vendor text,
  product_url text,
  substitutes_allowed boolean not null default true,

  estimated_parts_cost numeric(12,2)
    check (estimated_parts_cost is null or estimated_parts_cost >= 0),
  estimated_labor_cost numeric(12,2)
    check (estimated_labor_cost is null or estimated_labor_cost >= 0),
  estimated_total_cost numeric(12,2)
    check (estimated_total_cost is null or estimated_total_cost >= 0),

  notes text,
  status text not null default 'proposed' check (
    status in ('proposed', 'withdrawn')
  ),

  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mindful_inventory_upgrades_vehicle_idx
  on public.mindful_inventory_upgrades(vehicle_id, created_at);

create index mindful_inventory_upgrades_company_idx
  on public.mindful_inventory_upgrades(company_id);

create index mindful_inventory_upgrades_status_idx
  on public.mindful_inventory_upgrades(vehicle_id, status);

create or replace function public.validate_inventory_upgrade_tenant()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  vehicle_company_id uuid;
begin
  select vehicle.company_id
  into vehicle_company_id
  from public.mindful_inventory_vehicles vehicle
  where vehicle.id = new.vehicle_id;

  if vehicle_company_id is null then
    raise exception 'Inventory vehicle not found.';
  end if;

  if vehicle_company_id <> new.company_id then
    raise exception 'Upgrade company must match vehicle company.';
  end if;

  if new.requested_by_user_id is not null and not exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = new.company_id
      and membership.user_id = new.requested_by_user_id
      and membership.status = 'active'
  ) then
    raise exception 'Upgrade requester must be an active member of this company.';
  end if;

  return new;
end;
$$;

create trigger mindful_inventory_validate_upgrade_tenant
before insert or update of company_id, vehicle_id, requested_by_user_id
on public.mindful_inventory_upgrades
for each row
execute function public.validate_inventory_upgrade_tenant();

create or replace function public.set_inventory_upgrade_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger mindful_inventory_upgrades_set_updated_at
before update on public.mindful_inventory_upgrades
for each row
execute function public.set_inventory_upgrade_updated_at();

alter table public.mindful_inventory_upgrades enable row level security;

create policy mindful_inventory_upgrades_select
on public.mindful_inventory_upgrades
for select
to authenticated
using (public.is_company_member(company_id, auth.uid()));

create policy mindful_inventory_upgrades_insert
on public.mindful_inventory_upgrades
for insert
to authenticated
with check (public.is_company_member(company_id, auth.uid()));

create policy mindful_inventory_upgrades_update
on public.mindful_inventory_upgrades
for update
to authenticated
using (public.is_company_member(company_id, auth.uid()))
with check (public.is_company_member(company_id, auth.uid()));

create policy mindful_inventory_upgrades_delete
on public.mindful_inventory_upgrades
for delete
to authenticated
using (public.is_company_member(company_id, auth.uid()));

grant select, insert, update, delete
on public.mindful_inventory_upgrades
to authenticated;
