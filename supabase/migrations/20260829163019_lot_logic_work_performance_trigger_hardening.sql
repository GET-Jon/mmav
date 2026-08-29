create or replace function private.capture_lot_logic_work_performance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_work_key text;
begin
  if new.status <> 'complete' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'complete'
       and old.actual_cost is not distinct from new.actual_cost
       and old.actual_labor_minutes is not distinct from new.actual_labor_minutes
       and old.actual_start_at is not distinct from new.actual_start_at
       and old.actual_end_at is not distinct from new.actual_end_at
       and old.completed_by_partner_id is not distinct from new.completed_by_partner_id
       and old.assigned_partner_id is not distinct from new.assigned_partner_id then
      return new;
    end if;
  end if;

  select v.company_id
    into v_company_id
  from public.mindful_inventory_vehicles v
  where v.id = new.vehicle_id;

  if v_company_id is null then
    return new;
  end if;

  v_work_key := private.lot_logic_normalized_work_key(new.category, new.subcategory, new.title);
  perform private.refresh_lot_logic_work_performance(v_company_id, v_work_key);

  return new;
end;
$$;

revoke all on function private.capture_lot_logic_work_performance() from public;
