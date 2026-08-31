create or replace function public.sync_plan_item_planning_amount_from_estimate()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.planning_amount is not distinct from old.planning_amount
     and (
       new.estimated_cost_low is distinct from old.estimated_cost_low
       or new.estimated_cost_high is distinct from old.estimated_cost_high
     ) then
    new.planning_amount := coalesce(new.estimated_cost_high, new.estimated_cost_low, new.planning_amount, 0);
  end if;
  return new;
end;
$$;

drop trigger if exists sync_plan_item_planning_amount_from_estimate on public.mindful_inventory_plan_items;
create trigger sync_plan_item_planning_amount_from_estimate
before update of estimated_cost_low, estimated_cost_high, planning_amount
on public.mindful_inventory_plan_items
for each row
execute function public.sync_plan_item_planning_amount_from_estimate();
