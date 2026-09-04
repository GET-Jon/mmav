-- Materialize mechanic-suggested parts as Part Requirements during Work Plan generation,
-- then connect them to Work Orders when the plan is activated.

create or replace function public.seed_part_requirements_from_plan_finding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle_id uuid;
  v_company_id uuid;
  v_partner_id uuid;
  v_parts jsonb;
  v_part jsonb;
  v_description text;
  v_quantity numeric;
  v_part_number text;
  v_offer numeric;
  v_note text;
begin
  select plan.vehicle_id, vehicle.company_id, finding.source_partner_id, coalesce(finding.mechanical_part_suggestions, '[]'::jsonb)
    into v_vehicle_id, v_company_id, v_partner_id, v_parts
  from public.mindful_inventory_plan_items item
  join public.mindful_inventory_car_plan_versions version on version.id = item.plan_version_id
  join public.mindful_inventory_car_plans plan on plan.id = version.car_plan_id
  join public.mindful_inventory_vehicles vehicle on vehicle.id = plan.vehicle_id
  join public.mindful_inventory_findings finding on finding.id = new.finding_id
  where item.id = new.plan_item_id;

  if v_vehicle_id is null or jsonb_typeof(v_parts) <> 'array' then return new; end if;

  for v_part in select value from jsonb_array_elements(v_parts)
  loop
    v_description := nullif(btrim(coalesce(v_part->>'name', v_part->>'description', '')), '');
    if v_description is null then continue; end if;
    begin v_quantity := greatest(coalesce((v_part->>'quantity')::numeric, 1), 0.01); exception when others then v_quantity := 1; end;
    v_part_number := nullif(btrim(coalesce(v_part->>'partNumber', v_part->>'part_number', '')), '');
    begin v_offer := coalesce((v_part->>'partnerOfferUnitPrice')::numeric, (v_part->>'estimatedUnitPrice')::numeric, (v_part->>'unitPrice')::numeric); exception when others then v_offer := null; end;
    v_note := nullif(btrim(coalesce(v_part->>'sourcingNote', v_part->>'notes', '')), '');

    if not exists (
      select 1 from public.mindful_inventory_part_requirements requirement
      where requirement.plan_item_id = new.plan_item_id
        and requirement.finding_id = new.finding_id
        and lower(requirement.description) = lower(v_description)
    ) then
      insert into public.mindful_inventory_part_requirements (
        company_id, vehicle_id, plan_item_id, finding_id, description, quantity, part_number,
        origin, requirement_status, suggested_by_partner_id, partner_offer_unit_price, partner_offer_note, blocking
      ) values (
        v_company_id, v_vehicle_id, new.plan_item_id, new.finding_id, v_description, v_quantity, v_part_number,
        'mechanic', 'suggested', v_partner_id, v_offer, v_note, true
      );
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_seed_part_requirements_from_plan_finding on public.mindful_inventory_plan_item_findings;
create trigger trg_seed_part_requirements_from_plan_finding
after insert on public.mindful_inventory_plan_item_findings
for each row execute function public.seed_part_requirements_from_plan_finding();

create or replace function public.seed_part_requirements_from_plan_upgrade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle_id uuid;
  v_company_id uuid;
  v_parts jsonb;
  v_part jsonb;
  v_description text;
  v_quantity numeric;
  v_part_number text;
  v_offer numeric;
  v_note text;
begin
  if new.upgrade_id is null then return new; end if;
  select plan.vehicle_id, vehicle.company_id, coalesce(upgrade.mechanical_part_suggestions, '[]'::jsonb)
    into v_vehicle_id, v_company_id, v_parts
  from public.mindful_inventory_car_plan_versions version
  join public.mindful_inventory_car_plans plan on plan.id = version.car_plan_id
  join public.mindful_inventory_vehicles vehicle on vehicle.id = plan.vehicle_id
  join public.mindful_inventory_upgrades upgrade on upgrade.id = new.upgrade_id
  where version.id = new.plan_version_id;

  if v_vehicle_id is null or jsonb_typeof(v_parts) <> 'array' then return new; end if;
  for v_part in select value from jsonb_array_elements(v_parts)
  loop
    v_description := nullif(btrim(coalesce(v_part->>'name', v_part->>'description', '')), '');
    if v_description is null then continue; end if;
    begin v_quantity := greatest(coalesce((v_part->>'quantity')::numeric, 1), 0.01); exception when others then v_quantity := 1; end;
    v_part_number := nullif(btrim(coalesce(v_part->>'partNumber', v_part->>'part_number', '')), '');
    begin v_offer := coalesce((v_part->>'partnerOfferUnitPrice')::numeric, (v_part->>'estimatedUnitPrice')::numeric, (v_part->>'unitPrice')::numeric); exception when others then v_offer := null; end;
    v_note := nullif(btrim(coalesce(v_part->>'sourcingNote', v_part->>'notes', '')), '');

    if not exists (
      select 1 from public.mindful_inventory_part_requirements requirement
      where requirement.plan_item_id = new.id
        and requirement.upgrade_id = new.upgrade_id
        and lower(requirement.description) = lower(v_description)
    ) then
      insert into public.mindful_inventory_part_requirements (
        company_id, vehicle_id, plan_item_id, upgrade_id, description, quantity, part_number,
        origin, requirement_status, partner_offer_unit_price, partner_offer_note, blocking
      ) values (
        v_company_id, v_vehicle_id, new.id, new.upgrade_id, v_description, v_quantity, v_part_number,
        'mechanic', 'suggested', v_offer, v_note, true
      );
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_seed_part_requirements_from_plan_upgrade on public.mindful_inventory_plan_items;
create trigger trg_seed_part_requirements_from_plan_upgrade
after insert on public.mindful_inventory_plan_items
for each row execute function public.seed_part_requirements_from_plan_upgrade();

create or replace function public.link_part_requirements_to_work_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_part_id uuid;
  v_resolution text;
begin
  update public.mindful_inventory_part_requirements
    set work_order_id = new.id, updated_at = now()
  where plan_item_id = new.plan_item_id and work_order_id is null;

  for v_req in
    select * from public.mindful_inventory_part_requirements
    where plan_item_id = new.plan_item_id
      and requirement_status = 'required'
      and fulfillment_method is not null
      and fulfillment_method <> 'not_required'
      and linked_part_id is null
  loop
    v_resolution := case v_req.fulfillment_method
      when 'in_stock' then 'in_stock'
      when 'partner_supplied' then 'partner_supplied'
      when 'customer_supplied' then 'customer_supplied'
      else null
    end;
    insert into public.mindful_inventory_work_order_parts (
      work_order_id, requirement_id, description, quantity, part_number, status,
      dependency_resolution, dependency_resolved_at, notes
    ) values (
      new.id, v_req.id, v_req.description, v_req.quantity, v_req.part_number, 'needed',
      v_resolution, case when v_resolution is not null then now() else null end, v_req.owner_decision_note
    ) returning id into v_part_id;
    update public.mindful_inventory_part_requirements set linked_part_id = v_part_id where id = v_req.id;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_link_part_requirements_to_work_order on public.mindful_inventory_work_orders;
create trigger trg_link_part_requirements_to_work_order
after insert on public.mindful_inventory_work_orders
for each row execute function public.link_part_requirements_to_work_order();
