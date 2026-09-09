alter table public.mindful_inventory_plan_items
  add column if not exists ai_estimated_labor_hours numeric(8,2)
    check (ai_estimated_labor_hours is null or ai_estimated_labor_hours >= 0),
  add column if not exists ai_estimated_elapsed_hours numeric(8,2)
    check (ai_estimated_elapsed_hours is null or ai_estimated_elapsed_hours >= 0);

-- Approved Work Plan items are intentionally immutable, so legacy approved rows
-- are left untouched. New AI-generated draft items persist their original AI
-- timing baselines at creation time.

create or replace function public.populate_inventory_work_order_time_baseline()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_plan record;
begin
  if new.plan_item_id is null then return new; end if;

  select ai_estimated_labor_hours,
         ai_estimated_elapsed_hours,
         estimated_labor_hours,
         estimated_elapsed_hours,
         estimated_duration_hours,
         labor_estimate_rationale,
         elapsed_estimate_rationale
    into v_plan
  from public.mindful_inventory_plan_items
  where id = new.plan_item_id;

  if not found then return new; end if;

  if new.ai_estimated_labor_minutes is null and coalesce(v_plan.ai_estimated_labor_hours, v_plan.estimated_labor_hours) is not null then
    new.ai_estimated_labor_minutes := round(coalesce(v_plan.ai_estimated_labor_hours, v_plan.estimated_labor_hours) * 60)::integer;
  end if;
  if new.ai_estimated_elapsed_minutes is null and coalesce(v_plan.ai_estimated_elapsed_hours, v_plan.estimated_elapsed_hours, v_plan.estimated_duration_hours) is not null then
    new.ai_estimated_elapsed_minutes := round(coalesce(v_plan.ai_estimated_elapsed_hours, v_plan.estimated_elapsed_hours, v_plan.estimated_duration_hours) * 60)::integer;
  end if;
  if new.labor_estimate_rationale is null then new.labor_estimate_rationale := v_plan.labor_estimate_rationale; end if;
  if new.elapsed_estimate_rationale is null then new.elapsed_estimate_rationale := v_plan.elapsed_estimate_rationale; end if;
  return new;
end;
$$;
