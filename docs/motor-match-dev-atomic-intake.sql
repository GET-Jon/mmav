-- Run only against motor-match-dev (dxjqjhvecncjdbhxbvjb).
alter table public.mm_search_requests
  add column if not exists original_budget_kind text not null default 'out_the_door'
    check (original_budget_kind in ('vehicle','out_the_door')),
  add column if not exists current_budget_kind text not null default 'out_the_door'
    check (current_budget_kind in ('vehicle','out_the_door'));

-- Atomic server-only intake: no public/anonymous access.
create or replace function public.mm_submit_intake(input jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  customer_uuid uuid;
  request_uuid uuid;
  vehicle_row jsonb;
  adjustment_row jsonb;
  raw_contact text;
  trade_kind text;
  is_flexible boolean;
  initial_flexible boolean;
begin
  if input is null then raise exception 'missing intake'; end if;
  raw_contact := left(trim(input->>'contact'), 200);
  trade_kind := input->>'trade';
  if trade_kind not in ('yes','maybe','no') then raise exception 'invalid trade'; end if;
  if length(trim(input->>'name')) < 2 or length(raw_contact) < 5 then raise exception 'invalid contact'; end if;
  if length(trim(input #>> '{current,vehicle}')) < 3
      or length(trim(input #>> '{original,vehicle}')) < 3 then raise exception 'invalid vehicle'; end if;
  if (input #>> '{current,budget}')::numeric <= 0 or (input #>> '{original,budget}')::numeric <= 0 then raise exception 'invalid budget'; end if;
  is_flexible := (input #>> '{current,mileage}') = 'flexible';
  initial_flexible := (input #>> '{original,mileage}') = 'flexible';

  insert into public.mm_customers(display_name,contact_email,contact_phone)
  values (
    left(trim(input->>'name'),120),
    case when position('@' in raw_contact)>0 then raw_contact else null end,
    case when position('@' in raw_contact)=0 then raw_contact else null end
  ) returning id into customer_uuid;

  insert into public.mm_search_requests(
    customer_id, source, original_vehicle, original_budget, original_budget_kind,
    original_max_mileage, original_mileage_flexible,
    current_vehicle, current_budget, current_budget_kind,
    current_max_mileage, current_mileage_flexible, allow_alternatives, has_trade
  ) values (
    customer_uuid, 'website',
    left(input #>> '{original,vehicle}',140),
    (input #>> '{original,budget}')::numeric,
    (input #>> '{original,budgetKind}'),
    case when initial_flexible then null else (input #>> '{original,mileage}')::integer end,
    initial_flexible,
    left(input #>> '{current,vehicle}',140),
    (input #>> '{current,budget}')::numeric,
    (input #>> '{current,budgetKind}'),
    case when is_flexible then null else (input #>> '{current,mileage}')::integer end,
    is_flexible,
    coalesce((input->>'alternatives')::boolean,false),
    trade_kind
  ) returning id into request_uuid;

  insert into public.mm_acceptable_vehicles(request_id, vehicle_description, preference)
  values (request_uuid, left(input #>> '{original,vehicle}',140), 'primary');

  for vehicle_row in select value from jsonb_array_elements(coalesce(input->'additionalCars','[]'::jsonb))
  loop
    if length(trim(vehicle_row #>> '{}')) between 3 and 140 then
      insert into public.mm_acceptable_vehicles(request_id, vehicle_description, preference)
      values (request_uuid, vehicle_row #>> '{}', 'acceptable');
    end if;
  end loop;

  for adjustment_row in select value from jsonb_array_elements(coalesce(input->'changes','[]'::jsonb))
  loop
    insert into public.mm_search_adjustments(request_id,field,previous_value,next_value)
    values (request_uuid, adjustment_row->>'field', left(adjustment_row->>'from',200), left(adjustment_row->>'to',200));
  end loop;

  if trade_kind in ('yes','maybe') and ((input->>'tradeVin') is not null or (input->>'tradeMiles') is not null) then
    insert into public.mm_seller_vehicles(customer_id,vin,mileage)
    values (customer_uuid, nullif(input->>'tradeVin',''), (input->>'tradeMiles')::integer);
  end if;
  return request_uuid;
end;
$$;

revoke all on function public.mm_submit_intake(jsonb) from public, anon, authenticated;
grant execute on function public.mm_submit_intake(jsonb) to service_role;
