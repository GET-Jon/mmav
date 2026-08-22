-- Lot Logic Inventory — distinguish hands-on labor from elapsed turnaround time.
-- Scheduling uses elapsed time; labor/capacity uses hands-on time.

alter table public.mindful_inventory_plan_items
  add column if not exists estimated_labor_hours numeric(8,2)
    check (estimated_labor_hours is null or estimated_labor_hours >= 0),
  add column if not exists estimated_elapsed_hours numeric(8,2)
    check (estimated_elapsed_hours is null or estimated_elapsed_hours >= 0);

alter table public.mindful_inventory_work_orders
  add column if not exists estimated_labor_minutes integer
    check (estimated_labor_minutes is null or estimated_labor_minutes >= 0),
  add column if not exists estimated_elapsed_minutes integer
    check (estimated_elapsed_minutes is null or estimated_elapsed_minutes >= 0);

-- Keep the legacy duration fields intact for history. New code writes explicit
-- labor + elapsed values and mirrors elapsed into estimated_duration_minutes.
comment on column public.mindful_inventory_plan_items.estimated_duration_hours is
  'Legacy ambiguous AI duration. New work plans use estimated_labor_hours and estimated_elapsed_hours.';
comment on column public.mindful_inventory_plan_items.estimated_labor_hours is
  'Estimated hands-on technician/vendor labor hours.';
comment on column public.mindful_inventory_plan_items.estimated_elapsed_hours is
  'Estimated calendar/turnaround hours from task start to task-ready completion, including non-labor wait/cure/diagnostic time.';
comment on column public.mindful_inventory_work_orders.estimated_labor_minutes is
  'Estimated hands-on labor minutes used for capacity planning.';
comment on column public.mindful_inventory_work_orders.estimated_elapsed_minutes is
  'Estimated elapsed calendar minutes used for scheduling.';

-- Recreate activation so new Work Orders carry both labor capacity and elapsed
-- scheduling estimates. The existing estimated_duration_minutes is mirrored from
-- elapsed time for backward compatibility.
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
  join public.mindful_inventory_car_plans plan on plan.id = version.car_plan_id
  join public.mindful_inventory_vehicles vehicle on vehicle.id = plan.vehicle_id
  where version.id = requested_plan_version_id
    and plan.vehicle_id = requested_vehicle_id
    and vehicle.company_id = requested_company_id
  for update of version, plan, vehicle;

  if v_plan_id is null then raise exception 'Work Plan version not found for this vehicle.'; end if;

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

  if v_status <> 'draft' then raise exception 'Only a Draft Preliminary Work Plan may be activated.'; end if;

  update public.mindful_inventory_plan_items
  set decision = 'approved', updated_at = now()
  where plan_version_id = requested_plan_version_id
    and decision = 'investigate';

  update public.mindful_inventory_car_plan_versions
  set status = 'approved', approved_by = requesting_user_id, approved_at = now(), updated_at = now()
  where id = requested_plan_version_id;

  update public.mindful_inventory_car_plans
  set current_approved_version_id = requested_plan_version_id, updated_at = now()
  where id = v_plan_id;

  insert into public.mindful_inventory_work_orders (
    vehicle_id, plan_item_id, plan_version_id, finding_id,
    source_type, source_reference, title, description, category, subcategory,
    classification, project_owner_user_id, next_action_owner_user_id, status,
    estimated_duration_minutes, estimated_labor_minutes, estimated_elapsed_minutes,
    initial_estimate, approved_budget, current_forecast, created_by, updated_by
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
    case when coalesce(item.estimated_elapsed_hours, item.estimated_duration_hours) is null then null
      else round(coalesce(item.estimated_elapsed_hours, item.estimated_duration_hours) * 60)::integer end,
    case when item.estimated_labor_hours is null then null else round(item.estimated_labor_hours * 60)::integer end,
    case when coalesce(item.estimated_elapsed_hours, item.estimated_duration_hours) is null then null
      else round(coalesce(item.estimated_elapsed_hours, item.estimated_duration_hours) * 60)::integer end,
    item.planning_amount,
    item.planning_amount,
    item.planning_amount,
    requesting_user_id,
    requesting_user_id
  from public.mindful_inventory_plan_items item
  where item.plan_version_id = requested_plan_version_id
    and item.decision = 'approved'
    and not exists (
      select 1 from public.mindful_inventory_work_orders existing
      where existing.plan_version_id = requested_plan_version_id
        and existing.plan_item_id = item.id
    );

  get diagnostics v_created = row_count;

  update public.mindful_inventory_vehicles
  set phase = 'reconditioning',
      next_action = case when v_created > 0 then 'Schedule and execute Active Work' else 'Review Active Work Plan' end,
      next_action_owner_user_id = v_owner_id,
      updated_by = requesting_user_id,
      updated_at = now()
  where id = requested_vehicle_id and company_id = requested_company_id;

  insert into public.mindful_inventory_history (
    company_id, vehicle_id, event_type, entity_type, entity_id, actor_user_id, summary, metadata
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
