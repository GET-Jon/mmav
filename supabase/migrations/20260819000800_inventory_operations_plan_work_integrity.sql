-- Lot Logic Inventory Operations — cross-table integrity for Car Plans and Work Orders.
-- These guards prevent application bugs from linking plan/work records across vehicles or versions.

create or replace function public.validate_mindful_inventory_current_plan_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.current_approved_version_id is not null and not exists (
    select 1
    from public.mindful_inventory_car_plan_versions version
    where version.id = new.current_approved_version_id
      and version.car_plan_id = new.id
      and version.status = 'approved'
  ) then
    raise exception 'Current Car Plan version must be an approved version of the same Car Plan.';
  end if;
  return new;
end;
$$;

create trigger mindful_inventory_car_plans_current_version_integrity_trigger
before insert or update of current_approved_version_id
on public.mindful_inventory_car_plans
for each row execute function public.validate_mindful_inventory_current_plan_version();

create or replace function public.validate_mindful_inventory_plan_version_parent()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.parent_version_id is not null and not exists (
    select 1
    from public.mindful_inventory_car_plan_versions parent
    where parent.id = new.parent_version_id
      and parent.car_plan_id = new.car_plan_id
      and parent.version_number < new.version_number
  ) then
    raise exception 'Parent Car Plan version must belong to the same Car Plan and precede the revision.';
  end if;
  return new;
end;
$$;

create trigger mindful_inventory_car_plan_versions_parent_integrity_trigger
before insert or update of parent_version_id, car_plan_id, version_number
on public.mindful_inventory_car_plan_versions
for each row execute function public.validate_mindful_inventory_plan_version_parent();

create or replace function public.validate_mindful_inventory_plan_change_request_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.mindful_inventory_car_plans plan
    where plan.id = new.car_plan_id
      and plan.vehicle_id = new.vehicle_id
  ) then
    raise exception 'Plan Change Request vehicle and Car Plan do not match.';
  end if;

  if new.resulting_plan_version_id is not null and not exists (
    select 1
    from public.mindful_inventory_car_plan_versions version
    where version.id = new.resulting_plan_version_id
      and version.car_plan_id = new.car_plan_id
  ) then
    raise exception 'Resulting Car Plan version must belong to the requested Car Plan.';
  end if;

  return new;
end;
$$;

create trigger mindful_inventory_plan_change_requests_scope_integrity_trigger
before insert or update of vehicle_id, car_plan_id, resulting_plan_version_id
on public.mindful_inventory_plan_change_requests
for each row execute function public.validate_mindful_inventory_plan_change_request_scope();

create or replace function public.validate_mindful_inventory_work_order_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  resolved_vehicle_id uuid;
  resolved_plan_version_id uuid;
begin
  select plan.vehicle_id, item.plan_version_id
  into resolved_vehicle_id, resolved_plan_version_id
  from public.mindful_inventory_plan_items item
  join public.mindful_inventory_car_plan_versions version
    on version.id = item.plan_version_id
  join public.mindful_inventory_car_plans plan
    on plan.id = version.car_plan_id
  where item.id = new.plan_item_id;

  if resolved_vehicle_id is null then
    raise exception 'Work Order Plan Item was not found.';
  end if;

  if resolved_vehicle_id <> new.vehicle_id then
    raise exception 'Work Order vehicle must match the Plan Item vehicle.';
  end if;

  if resolved_plan_version_id <> new.plan_version_id then
    raise exception 'Work Order Plan version must match the Plan Item version.';
  end if;

  if not exists (
    select 1
    from public.mindful_inventory_plan_items item
    where item.id = new.plan_item_id
      and item.decision = 'approved'
  ) then
    raise exception 'Work Orders may only execute approved Plan Items.';
  end if;

  return new;
end;
$$;

create trigger mindful_inventory_work_orders_scope_integrity_trigger
before insert or update of vehicle_id, plan_item_id, plan_version_id
on public.mindful_inventory_work_orders
for each row execute function public.validate_mindful_inventory_work_order_scope();

create or replace function public.validate_mindful_inventory_plan_change_request_work_order()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.work_order_id is not null and not exists (
    select 1
    from public.mindful_inventory_work_orders work_order
    where work_order.id = new.work_order_id
      and work_order.vehicle_id = new.vehicle_id
  ) then
    raise exception 'Plan Change Request Work Order must belong to the same vehicle.';
  end if;
  return new;
end;
$$;

create trigger mindful_inventory_plan_change_requests_work_order_integrity_trigger
before insert or update of work_order_id, vehicle_id
on public.mindful_inventory_plan_change_requests
for each row execute function public.validate_mindful_inventory_plan_change_request_work_order();
