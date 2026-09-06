-- Keep AI part-price estimates distinct from partner offers and actual acquisition cost.
alter table public.mindful_inventory_part_requirements
  add column if not exists ai_estimated_unit_price_low numeric null,
  add column if not exists ai_estimated_unit_price_high numeric null,
  add column if not exists ai_price_basis text null;

alter table public.mindful_inventory_part_requirements
  drop constraint if exists mindful_inventory_part_requirements_ai_price_range_check;
alter table public.mindful_inventory_part_requirements
  add constraint mindful_inventory_part_requirements_ai_price_range_check
  check (
    (ai_estimated_unit_price_low is null or ai_estimated_unit_price_low >= 0)
    and (ai_estimated_unit_price_high is null or ai_estimated_unit_price_high >= 0)
    and (
      ai_estimated_unit_price_low is null
      or ai_estimated_unit_price_high is null
      or ai_estimated_unit_price_high >= ai_estimated_unit_price_low
    )
  );

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
  v_ai_low numeric;
  v_ai_high numeric;
  v_ai_basis text;
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
    begin v_offer := (v_part->>'partnerOfferUnitPrice')::numeric; exception when others then v_offer := null; end;
    begin v_ai_low := coalesce((v_part->>'aiEstimatedUnitPriceLow')::numeric, (v_part->>'estimatedUnitPriceLow')::numeric); exception when others then v_ai_low := null; end;
    begin v_ai_high := coalesce((v_part->>'aiEstimatedUnitPriceHigh')::numeric, (v_part->>'estimatedUnitPriceHigh')::numeric); exception when others then v_ai_high := null; end;
    v_ai_basis := nullif(btrim(coalesce(v_part->>'aiPriceBasis', '')), '');
    v_note := nullif(btrim(coalesce(v_part->>'sourcingNote', v_part->>'notes', '')), '');

    if not exists (
      select 1 from public.mindful_inventory_part_requirements requirement
      where requirement.plan_item_id = new.plan_item_id
        and requirement.finding_id = new.finding_id
        and lower(requirement.description) = lower(v_description)
    ) then
      insert into public.mindful_inventory_part_requirements (
        company_id, vehicle_id, plan_item_id, finding_id, description, quantity, part_number,
        origin, requirement_status, suggested_by_partner_id, partner_offer_unit_price, partner_offer_note,
        ai_estimated_unit_price_low, ai_estimated_unit_price_high, ai_price_basis, blocking
      ) values (
        v_company_id, v_vehicle_id, new.plan_item_id, new.finding_id, v_description, v_quantity, v_part_number,
        case when v_ai_low is not null or v_ai_high is not null then 'ai' else 'mechanic' end,
        'suggested', v_partner_id, v_offer, v_note, v_ai_low, v_ai_high, v_ai_basis, true
      );
    end if;
  end loop;
  return new;
end;
$$;

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
  v_ai_low numeric;
  v_ai_high numeric;
  v_ai_basis text;
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
    begin v_offer := (v_part->>'partnerOfferUnitPrice')::numeric; exception when others then v_offer := null; end;
    begin v_ai_low := coalesce((v_part->>'aiEstimatedUnitPriceLow')::numeric, (v_part->>'estimatedUnitPriceLow')::numeric); exception when others then v_ai_low := null; end;
    begin v_ai_high := coalesce((v_part->>'aiEstimatedUnitPriceHigh')::numeric, (v_part->>'estimatedUnitPriceHigh')::numeric); exception when others then v_ai_high := null; end;
    v_ai_basis := nullif(btrim(coalesce(v_part->>'aiPriceBasis', '')), '');
    v_note := nullif(btrim(coalesce(v_part->>'sourcingNote', v_part->>'notes', '')), '');

    if not exists (
      select 1 from public.mindful_inventory_part_requirements requirement
      where requirement.plan_item_id = new.id
        and requirement.upgrade_id = new.upgrade_id
        and lower(requirement.description) = lower(v_description)
    ) then
      insert into public.mindful_inventory_part_requirements (
        company_id, vehicle_id, plan_item_id, upgrade_id, description, quantity, part_number,
        origin, requirement_status, partner_offer_unit_price, partner_offer_note,
        ai_estimated_unit_price_low, ai_estimated_unit_price_high, ai_price_basis, blocking
      ) values (
        v_company_id, v_vehicle_id, new.id, new.upgrade_id, v_description, v_quantity, v_part_number,
        case when v_ai_low is not null or v_ai_high is not null then 'ai' else 'mechanic' end,
        'suggested', v_offer, v_note, v_ai_low, v_ai_high, v_ai_basis, true
      );
    end if;
  end loop;
  return new;
end;
$$;
