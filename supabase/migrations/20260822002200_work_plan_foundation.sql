-- Lot Logic Inventory — Preliminary/Active Work Plan source integrity.
-- Adds explicit upgrade provenance, closes approved-snapshot mutation gaps,
-- and provides one transactional authorization boundary for Work Plan activation.

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

-- Work Orders must execute an approved item from an approved/Active version.
create or replace function public.validate_mindful_inventory_work_order_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  resolved_vehicle_id uuid;
  resolved_plan_version_id uuid;
  resolved_version_status public.mindful_inventory_plan_status;
begin
  select plan.vehicle_id, item.plan_version_id, version.status
  into resolved_vehicle_id, resolved_plan_version_id, resolved_version_status
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

  if resolved_version_status <> 'approved' then
    raise exception 'Work Orders may only execute an approved Work Plan version.';
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

-- Atomic authorization boundary: owner/admin approves the Preliminary Work Plan,
-- the immutable Active snapshot is established, and initial Work Orders are created.
create or replace function public.activate_inventory_work_plan(
  requested_vehicle_id uuid,
  requested_plan_version_id uuid,
  requested_company_id uuid,
  requesting_user_id uuid
)
returns table (
  returned_plan_version_id uuid,
  work_orders_created integer,
  activated boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_status public.mindful_inventory_plan_status;
  v_owner_id uuid;
  v_created integer := 0;
begin
  if not public.is_company_member(requested_company_id, requesting_user_id) then
    raise exception 'Company membership required.';
  end if;

  select version.car_plan_id, version.status, vehicle.project_owner_user_id
  into v_plan_id, v_status, v_owner_id
  from public.mindful_inventory_car_plan_versions version
  join public.mindful_inventory_car_plans plan
    on plan.id = version.car_plan_id
  join public.mindful_inventory_vehicles vehicle
    on vehicle.id = plan.vehicle_id
  where version.id = requested_plan_version_id
    and plan.vehicle_id = requested_vehicle_id
    and vehicle.company_id = requested_company_id
  for update of version, plan, vehicle;

  if v_plan_id is null then
    raise exception 'Work Plan version not found for this vehicle.';
  end if;

  if v_owner_id is distinct from requesting_user_id
     and not public.is_company_admin(requested_company_id, requesting_user_id) then
    raise exception 'Only the Vehicle Owner or a company admin may activate the Work Plan.';
  end if;

  if v_status = 'approved' then
    return query
    select requested_plan_version_id,
      (select count(*)::integer from public.mindful_inventory_work_orders wo where wo.plan_version_id = requested_plan_version_id),
      false;
    return;
  end if;

  if v_status <> 'draft' then
    raise exception 'Only a Draft Preliminary Work Plan may be activated.';
  end if;

  -- Owner approval authorizes investigative items as investigation work.
  update public.mindful_inventory_plan_items
  set decision = 'approved', updated_at = now()
  where plan_version_id = requested_plan_version_id
    and decision = 'investigate';

  update public.mindful_inventory_car_plan_versions
  set status = 'approved',
      approved_by = requesting_user_id,
      approved_at = now(),
      updated_at = now()
  where id = requested_plan_version_id;

  update public.mindful_inventory_car_plans
  set current_approved_version_id = requested_plan_version_id,
      updated_at = now()
  where id = v_plan_id;

  insert into public.mindful_inventory_work_orders (
    vehicle_id,
    plan_item_id,
    plan_version_id,
    finding_id,
    source_type,
    source_reference,
    title,
    description,
    category,
    subcategory,
    classification,
    project_owner_user_id,
    next_action_owner_user_id,
    status,
    estimated_duration_minutes,
    initial_estimate,
    approved_budget,
    current_forecast,
    created_by,
    updated_by
  )
  select
    requested_vehicle_id,
    item.id,
    requested_plan_version_id,
    item.finding_id,
    'car_plan',
    'active_work_plan',
    item.title,
    item.description,
    item.category,
    item.subcategory,
    item.classification,
    v_owner_id,
    v_owner_id,
    'planned',
    case when item.estimated_duration_hours is null then null else round(item.estimated_duration_hours * 60)::integer end,
    item.planning_amount,
    item.planning_amount,
    item.planning_amount,
    requesting_user_id,
    requesting_user_id
  from public.mindful_inventory_plan_items item
  where item.plan_version_id = requested_plan_version_id
    and item.decision = 'approved'
    and not exists (
      select 1
      from public.mindful_inventory_work_orders existing
      where existing.plan_version_id = requested_plan_version_id
        and existing.plan_item_id = item.id
    );

  get diagnostics v_created = row_count;

  update public.mindful_inventory_vehicles
  set phase = 'reconditioning',
      next_action = case when v_created > 0 then 'Review and start Active Work' else 'Review Active Work Plan' end,
      next_action_owner_user_id = v_owner_id,
      updated_by = requesting_user_id,
      updated_at = now()
  where id = requested_vehicle_id
    and company_id = requested_company_id;

  insert into public.mindful_inventory_history (
    company_id,
    vehicle_id,
    event_type,
    entity_type,
    entity_id,
    actor_user_id,
    summary,
    metadata
  ) values (
    requested_company_id,
    requested_vehicle_id,
    'work_plan_activated',
    'car_plan_version',
    requested_plan_version_id,
    requesting_user_id,
    'Preliminary Work Plan approved and activated.',
    jsonb_build_object('workOrdersCreated', v_created)
  );

  return query select requested_plan_version_id, v_created, true;
end;
$$;

revoke all on function public.activate_inventory_work_plan(uuid, uuid, uuid, uuid) from public;
grant execute on function public.activate_inventory_work_plan(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.activate_inventory_work_plan(uuid, uuid, uuid, uuid) to service_role;
