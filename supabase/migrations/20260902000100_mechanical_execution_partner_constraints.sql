alter table public.mindful_inventory_work_orders
  add column if not exists excluded_partner_id uuid references public.mindful_inventory_partners(id) on delete set null,
  add column if not exists partner_selection_required boolean not null default false,
  add column if not exists partner_selection_confirmed boolean not null default false;

create or replace function public.enforce_work_order_partner_constraint()
returns trigger
language plpgsql
as $$
declare
  v_excluded_partner_id uuid;
  v_explicit_setup_selection boolean;
begin
  if new.plan_item_id is not null then
    select i.performed_by_partner_id
      into v_excluded_partner_id
    from public.mindful_inventory_plan_item_findings pif
    join public.mindful_inventory_findings f on f.id = pif.finding_id
    join public.mindful_inventory_inspections i on i.id = f.inspection_id
    where pif.plan_item_id = new.plan_item_id
      and f.mechanical_can_perform = false
      and coalesce(f.mechanical_owner_review_status, '') = 'accepted'
      and i.performed_by_partner_id is not null
    limit 1;
  end if;

  if v_excluded_partner_id is null and new.finding_id is not null then
    select i.performed_by_partner_id
      into v_excluded_partner_id
    from public.mindful_inventory_findings f
    join public.mindful_inventory_inspections i on i.id = f.inspection_id
    where f.id = new.finding_id
      and f.mechanical_can_perform = false
      and coalesce(f.mechanical_owner_review_status, '') = 'accepted'
      and i.performed_by_partner_id is not null
    limit 1;
  end if;

  new.excluded_partner_id := v_excluded_partner_id;
  new.partner_selection_required := v_excluded_partner_id is not null;

  if not new.partner_selection_required then
    new.partner_selection_confirmed := false;
    return new;
  end if;

  if new.assigned_partner_id = new.excluded_partner_id then
    raise exception 'The inspection partner cannot be assigned to this Work Order because they marked this repair as work they cannot perform.';
  end if;

  if tg_op = 'UPDATE' and old.partner_selection_required and not coalesce(old.partner_selection_confirmed, false) then
    v_explicit_setup_selection :=
      (new.assigned_partner_id is not null or new.assigned_user_id is not null)
      and new.scheduled_start_at is null
      and new.scheduled_end_at is null
      and new.proposed_start_at is null
      and new.proposed_end_at is null
      and new.partner_confirmation_status is null;

    if v_explicit_setup_selection then
      new.partner_selection_confirmed := true;
    end if;
  end if;

  if not coalesce(new.partner_selection_confirmed, false) then
    new.assigned_partner_id := null;
    new.assigned_user_id := null;
    new.location_id := null;
    new.resource_id := null;
    new.scheduled_start_at := null;
    new.scheduled_end_at := null;
    new.proposed_start_at := null;
    new.proposed_end_at := null;
    new.partner_confirmation_status := null;
    new.schedule_source := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_work_order_partner_constraint on public.mindful_inventory_work_orders;
create trigger trg_enforce_work_order_partner_constraint
before insert or update of plan_item_id, finding_id, assigned_partner_id, assigned_user_id, partner_selection_confirmed
on public.mindful_inventory_work_orders
for each row execute function public.enforce_work_order_partner_constraint();

with constrained as (
  select distinct on (wo.id)
    wo.id,
    i.performed_by_partner_id as excluded_partner_id
  from public.mindful_inventory_work_orders wo
  join public.mindful_inventory_plan_item_findings pif on pif.plan_item_id = wo.plan_item_id
  join public.mindful_inventory_findings f on f.id = pif.finding_id
  join public.mindful_inventory_inspections i on i.id = f.inspection_id
  where f.mechanical_can_perform = false
    and coalesce(f.mechanical_owner_review_status, '') = 'accepted'
    and i.performed_by_partner_id is not null
)
update public.mindful_inventory_work_orders wo
set
  excluded_partner_id = c.excluded_partner_id,
  partner_selection_required = true,
  partner_selection_confirmed = case
    when wo.assigned_partner_id is null and wo.assigned_user_id is null then false
    when wo.assigned_partner_id = c.excluded_partner_id then false
    else true
  end,
  assigned_partner_id = case when wo.assigned_partner_id = c.excluded_partner_id then null else wo.assigned_partner_id end,
  location_id = case when wo.assigned_partner_id = c.excluded_partner_id then null else wo.location_id end,
  resource_id = case when wo.assigned_partner_id = c.excluded_partner_id then null else wo.resource_id end,
  scheduled_start_at = case when wo.assigned_partner_id = c.excluded_partner_id then null else wo.scheduled_start_at end,
  scheduled_end_at = case when wo.assigned_partner_id = c.excluded_partner_id then null else wo.scheduled_end_at end,
  proposed_start_at = case when wo.assigned_partner_id = c.excluded_partner_id then null else wo.proposed_start_at end,
  proposed_end_at = case when wo.assigned_partner_id = c.excluded_partner_id then null else wo.proposed_end_at end,
  partner_confirmation_status = case when wo.assigned_partner_id = c.excluded_partner_id then null else wo.partner_confirmation_status end,
  schedule_source = case when wo.assigned_partner_id = c.excluded_partner_id then null else wo.schedule_source end
from constrained c
where wo.id = c.id;