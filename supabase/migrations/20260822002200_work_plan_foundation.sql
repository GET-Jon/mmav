-- Lot Logic Inventory — Preliminary/Active Work Plan source integrity.
-- Adds explicit upgrade provenance to Plan Items and closes the approved-snapshot INSERT gap.

alter table public.mindful_inventory_plan_items
  add column if not exists upgrade_id uuid
    references public.mindful_inventory_upgrades(id) on delete set null;

create index if not exists mindful_inventory_plan_items_upgrade_idx
  on public.mindful_inventory_plan_items(upgrade_id)
  where upgrade_id is not null;

create or replace function public.validate_mindful_inventory_plan_item_upgrade_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  resolved_vehicle_id uuid;
begin
  if new.upgrade_id is null then
    return new;
  end if;

  select plan.vehicle_id
  into resolved_vehicle_id
  from public.mindful_inventory_car_plan_versions version
  join public.mindful_inventory_car_plans plan
    on plan.id = version.car_plan_id
  where version.id = new.plan_version_id;

  if resolved_vehicle_id is null then
    raise exception 'Plan Item version was not found.';
  end if;

  if not exists (
    select 1
    from public.mindful_inventory_upgrades upgrade
    where upgrade.id = new.upgrade_id
      and upgrade.vehicle_id = resolved_vehicle_id
  ) then
    raise exception 'Plan Item Upgrade must belong to the same vehicle.';
  end if;

  return new;
end;
$$;

drop trigger if exists mindful_inventory_plan_items_upgrade_scope_trigger
  on public.mindful_inventory_plan_items;

create trigger mindful_inventory_plan_items_upgrade_scope_trigger
before insert or update of plan_version_id, upgrade_id
on public.mindful_inventory_plan_items
for each row execute function public.validate_mindful_inventory_plan_item_upgrade_scope();

-- Existing immutability protected UPDATE/DELETE, but an INSERT could still be made
-- into an already approved version. Approved/Active plan snapshots must be closed.
create or replace function public.prevent_mindful_inventory_approved_plan_item_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.mindful_inventory_car_plan_versions version
    where version.id = new.plan_version_id
      and version.status = 'approved'
  ) then
    raise exception 'Items cannot be inserted into an approved Car Plan version.';
  end if;

  return new;
end;
$$;

drop trigger if exists mindful_inventory_plan_items_approved_insert_guard_trigger
  on public.mindful_inventory_plan_items;

create trigger mindful_inventory_plan_items_approved_insert_guard_trigger
before insert on public.mindful_inventory_plan_items
for each row execute function public.prevent_mindful_inventory_approved_plan_item_insert();
