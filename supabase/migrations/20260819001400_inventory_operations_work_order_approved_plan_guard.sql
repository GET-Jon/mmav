-- Lot Logic Inventory Operations — enforce approved plan versions for executable work.
-- A Plan Item decision alone is not sufficient authorization. The containing
-- Car Plan Version must also be approved before any Work Order can execute it.

create or replace function public.validate_mindful_inventory_work_order_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  resolved_vehicle_id uuid;
  resolved_plan_version_id uuid;
  resolved_plan_status public.mindful_inventory_plan_status;
  resolved_item_decision public.mindful_inventory_plan_item_decision;
begin
  select
    plan.vehicle_id,
    item.plan_version_id,
    version.status,
    item.decision
  into
    resolved_vehicle_id,
    resolved_plan_version_id,
    resolved_plan_status,
    resolved_item_decision
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

  if resolved_item_decision <> 'approved' then
    raise exception 'Work Orders may only execute approved Plan Items.';
  end if;

  if resolved_plan_status <> 'approved' then
    raise exception 'Work Orders may only execute Plan Items from an approved Car Plan version.';
  end if;

  return new;
end;
$$;
