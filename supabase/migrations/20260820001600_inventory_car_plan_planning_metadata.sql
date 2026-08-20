-- Lot Logic Inventory Operations — Draft Car Plan planning metadata.
-- Adds structured AI/planning provenance without authorizing execution.

alter table public.mindful_inventory_plan_items
  add column confidence numeric(5,4),
  add column assumptions jsonb not null default '[]'::jsonb,
  add column manager_investigation_required boolean not null default false,
  add column cost_source text not null default 'unknown',
  add column cost_source_detail text;

alter table public.mindful_inventory_plan_items
  add constraint mindful_inventory_plan_items_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  add constraint mindful_inventory_plan_items_assumptions_array_check
    check (jsonb_typeof(assumptions) = 'array'),
  add constraint mindful_inventory_plan_items_cost_source_check
    check (
      cost_source in (
        'known_quote',
        'historical_actual',
        'catalog_parts_cost',
        'comparable_vehicle',
        'ai_estimate',
        'unknown'
      )
    );

-- A Plan Item may address more than one Finding. The existing finding_id column
-- remains as the primary/legacy association; this junction stores all explicit
-- Finding links used by the Draft Car Plan review model.
create table public.mindful_inventory_plan_item_findings (
  plan_item_id uuid not null references public.mindful_inventory_plan_items(id) on delete cascade,
  finding_id uuid not null references public.mindful_inventory_findings(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (plan_item_id, finding_id)
);

create index mindful_inventory_plan_item_findings_finding_idx
  on public.mindful_inventory_plan_item_findings(finding_id);

create or replace function public.validate_mindful_inventory_plan_item_finding()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  linked_plan_status public.mindful_inventory_plan_status;
  linked_plan_vehicle_id uuid;
  linked_finding_vehicle_id uuid;
begin
  select version.status, plan.vehicle_id
    into linked_plan_status, linked_plan_vehicle_id
  from public.mindful_inventory_plan_items item
  join public.mindful_inventory_car_plan_versions version
    on version.id = item.plan_version_id
  join public.mindful_inventory_car_plans plan
    on plan.id = version.car_plan_id
  where item.id = coalesce(new.plan_item_id, old.plan_item_id);

  if linked_plan_vehicle_id is null then
    raise exception 'Plan Item does not exist.';
  end if;

  if linked_plan_status = 'approved' then
    raise exception 'Finding links in an approved Car Plan version are immutable.';
  end if;

  if tg_op <> 'DELETE' then
    select finding.vehicle_id
      into linked_finding_vehicle_id
    from public.mindful_inventory_findings finding
    where finding.id = new.finding_id;

    if linked_finding_vehicle_id is null then
      raise exception 'Finding does not exist.';
    end if;

    if linked_finding_vehicle_id <> linked_plan_vehicle_id then
      raise exception 'Plan Item and Finding must belong to the same vehicle.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger mindful_inventory_plan_item_findings_validate_trigger
before insert or update or delete on public.mindful_inventory_plan_item_findings
for each row execute function public.validate_mindful_inventory_plan_item_finding();

alter table public.mindful_inventory_plan_item_findings enable row level security;

grant select, insert, update, delete
  on table public.mindful_inventory_plan_item_findings
  to authenticated;

create policy "inventory members manage plan item findings"
on public.mindful_inventory_plan_item_findings
for all
using (
  exists (
    select 1
    from public.mindful_inventory_plan_items item
    join public.mindful_inventory_car_plan_versions version
      on version.id = item.plan_version_id
    join public.mindful_inventory_car_plans plan
      on plan.id = version.car_plan_id
    join public.mindful_inventory_vehicles vehicle
      on vehicle.id = plan.vehicle_id
    where item.id = plan_item_id
      and public.is_company_member(vehicle.company_id)
  )
)
with check (
  exists (
    select 1
    from public.mindful_inventory_plan_items item
    join public.mindful_inventory_car_plan_versions version
      on version.id = item.plan_version_id
    join public.mindful_inventory_car_plans plan
      on plan.id = version.car_plan_id
    join public.mindful_inventory_vehicles vehicle
      on vehicle.id = plan.vehicle_id
    where item.id = plan_item_id
      and public.is_company_member(vehicle.company_id)
  )
);
