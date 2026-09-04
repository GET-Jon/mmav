-- V15: authorization can proceed while quotes, partner confirmation, parts and scheduling remain open.

create or replace function public.normalize_inventory_plan_item_unknown_cost()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.cost_source = 'unknown' then
    new.estimated_cost_low := null;
    new.estimated_cost_high := null;
    new.planning_amount := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_inventory_plan_item_unknown_cost on public.mindful_inventory_plan_items;
create trigger trg_normalize_inventory_plan_item_unknown_cost
before insert or update of cost_source, estimated_cost_low, estimated_cost_high, planning_amount
on public.mindful_inventory_plan_items
for each row
execute function public.normalize_inventory_plan_item_unknown_cost();

create or replace function public.require_external_partner_confirmation()
returns trigger
language plpgsql
set search_path = public
as $$;
begin
  if new.assigned_partner_id is not null
     and new.partner_confirmation_status = 'confirmed'
     and (
       tg_op = 'INSERT'
       or old.assigned_partner_id is distinct from new.assigned_partner_id
       or old.partner_confirmation_status is null
     ) then
    new.partner_confirmation_status := 'awaiting_partner';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_require_external_partner_confirmation on public.mindful_inventory_work_orders;
create trigger trg_require_external_partner_confirmation
before insert or update of assigned_partner_id, partner_confirmation_status
on public.mindful_inventory_work_orders
for each row
execute function public.require_external_partner_confirmation();

comment on function public.normalize_inventory_plan_item_unknown_cost() is
  'Unknown-cost plan items are quote/diagnosis steps, not fabricated budget estimates.';
comment on function public.require_external_partner_confirmation() is
  'New external partner assignments begin awaiting confirmation; confirmation is an Active Work soft blocker, not a Work Plan approval prerequisite.';
