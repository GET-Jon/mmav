-- Lot Logic Inventory — make AI time estimates explainable and preserve a stable
-- baseline for deliberate human overrides.

alter table public.mindful_inventory_plan_items
  add column if not exists labor_estimate_rationale text,
  add column if not exists elapsed_estimate_rationale text;

alter table public.mindful_inventory_work_orders
  add column if not exists ai_estimated_labor_minutes integer
    check (ai_estimated_labor_minutes is null or ai_estimated_labor_minutes >= 0),
  add column if not exists ai_estimated_elapsed_minutes integer
    check (ai_estimated_elapsed_minutes is null or ai_estimated_elapsed_minutes >= 0),
  add column if not exists labor_estimate_rationale text,
  add column if not exists elapsed_estimate_rationale text;

comment on column public.mindful_inventory_plan_items.labor_estimate_rationale is
  'AI explanation for hands-on labor estimate.';
comment on column public.mindful_inventory_plan_items.elapsed_estimate_rationale is
  'AI explanation for elapsed turnaround estimate, including process/cure/wait assumptions.';
comment on column public.mindful_inventory_work_orders.ai_estimated_labor_minutes is
  'Stable original AI labor baseline used to detect material human overrides.';
comment on column public.mindful_inventory_work_orders.ai_estimated_elapsed_minutes is
  'Stable original AI elapsed baseline used to detect material human overrides.';

create or replace function public.populate_inventory_work_order_time_baseline()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_plan record;
begin
  if new.plan_item_id is null then return new; end if;

  select estimated_labor_hours,
         estimated_elapsed_hours,
         estimated_duration_hours,
         labor_estimate_rationale,
         elapsed_estimate_rationale
    into v_plan
  from public.mindful_inventory_plan_items
  where id = new.plan_item_id;

  if not found then return new; end if;

  if new.ai_estimated_labor_minutes is null and v_plan.estimated_labor_hours is not null then
    new.ai_estimated_labor_minutes := round(v_plan.estimated_labor_hours * 60)::integer;
  end if;
  if new.ai_estimated_elapsed_minutes is null and coalesce(v_plan.estimated_elapsed_hours, v_plan.estimated_duration_hours) is not null then
    new.ai_estimated_elapsed_minutes := round(coalesce(v_plan.estimated_elapsed_hours, v_plan.estimated_duration_hours) * 60)::integer;
  end if;
  if new.labor_estimate_rationale is null then
    new.labor_estimate_rationale := v_plan.labor_estimate_rationale;
  end if;
  if new.elapsed_estimate_rationale is null then
    new.elapsed_estimate_rationale := v_plan.elapsed_estimate_rationale;
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_work_order_time_baseline on public.mindful_inventory_work_orders;
create trigger inventory_work_order_time_baseline
before insert or update of plan_item_id on public.mindful_inventory_work_orders
for each row execute function public.populate_inventory_work_order_time_baseline();

-- Backfill existing Work Orders from their originating Work Plan item. Legacy
-- plans did not capture detailed rationales, so those rationale fields remain null
-- rather than inventing an explanation after the fact.
update public.mindful_inventory_work_orders wo
set ai_estimated_labor_minutes = coalesce(
      wo.ai_estimated_labor_minutes,
      case when pi.estimated_labor_hours is null then null else round(pi.estimated_labor_hours * 60)::integer end
    ),
    ai_estimated_elapsed_minutes = coalesce(
      wo.ai_estimated_elapsed_minutes,
      case when coalesce(pi.estimated_elapsed_hours, pi.estimated_duration_hours) is null then null
           else round(coalesce(pi.estimated_elapsed_hours, pi.estimated_duration_hours) * 60)::integer end
    ),
    labor_estimate_rationale = coalesce(wo.labor_estimate_rationale, pi.labor_estimate_rationale),
    elapsed_estimate_rationale = coalesce(wo.elapsed_estimate_rationale, pi.elapsed_estimate_rationale)
from public.mindful_inventory_plan_items pi
where wo.plan_item_id = pi.id;
