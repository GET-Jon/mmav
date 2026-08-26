create or replace function public.mindful_inventory_owner_coordinates_unassigned_suggested_work()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  if new.assigned_partner_id is null
     and new.assigned_user_id is null
     and new.schedule_source = 'suggested'
     and new.status = 'scheduled' then
    select project_owner_user_id into owner_id
    from public.mindful_inventory_vehicles
    where id = new.vehicle_id;

    if owner_id is not null then
      new.next_action_owner_user_id := owner_id;
    end if;

    if new.scheduled_start_at is not null then
      new.proposed_start_at := coalesce(new.proposed_start_at, new.scheduled_start_at);
      new.proposed_end_at := coalesce(new.proposed_end_at, new.scheduled_end_at);
      new.scheduled_start_at := null;
      new.scheduled_end_at := null;
    end if;

    new.status := 'ready_to_schedule';
    new.partner_confirmation_status := null;

    update public.mindful_inventory_vehicles
    set next_action = 'Select vendor / confirm appointment',
        next_action_owner_user_id = owner_id,
        updated_at = now()
    where id = new.vehicle_id
      and owner_id is not null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_owner_coordinates_unassigned_suggested_work on public.mindful_inventory_work_orders;
create trigger trg_owner_coordinates_unassigned_suggested_work
before insert or update on public.mindful_inventory_work_orders
for each row
execute function public.mindful_inventory_owner_coordinates_unassigned_suggested_work();
