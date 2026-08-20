-- Atomic handoff from a Lot Logic evaluation to Mindful Inventory.
--
-- Direction of data:
-- auction_evaluations -> mindful_inventory_vehicles
--
-- This function never updates an evaluation from Inventory data.
-- It only:
-- 1. Reads the evaluation.
-- 2. Creates an Inventory snapshot.
-- 3. Marks the evaluation Purchased.
--
-- Both writes happen in one database transaction.

create unique index if not exists
  mindful_inventory_vehicles_source_evaluation_unique_idx
on public.mindful_inventory_vehicles(source_evaluation_id)
where source_evaluation_id is not null;

create or replace function public.purchase_evaluation_and_add_to_inventory(
  evaluation_id uuid,
  requested_company_id uuid,
  requesting_user_id uuid
)
returns table (
  returned_evaluation_id uuid,
  returned_inventory_vehicle_id uuid,
  returned_status text,
  inventory_created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  evaluation_row record;
  existing_inventory_id uuid;
  new_inventory_id uuid;
  resolved_year integer;
  resolved_make text;
  resolved_model text;
  resolved_trim text;
  resolved_purchase_price numeric(12,2);
  resolved_expected_sale_price numeric(12,2);
begin
  -- Confirm the request is specifically for Mindful Motor Co.
  if not exists (
    select 1
    from public.companies company
    where company.id = requested_company_id
      and company.slug = 'mindful-motor-co'
      and company.status = 'active'
  ) then
    raise exception 'Mindful Inventory access denied.';
  end if;

  -- Confirm the requesting user is an active member of this company.
  if not public.is_company_member(
    requested_company_id,
    requesting_user_id
  ) then
    raise exception 'Company membership required.';
  end if;

  -- Lock the evaluation while the handoff is performed.
  select *
  into evaluation_row
  from public.auction_evaluations
  where id = evaluation_id
    and company_id = requested_company_id
  for update;

  if not found then
    raise exception 'Evaluation not found.';
  end if;

  -- If already imported, make the action idempotent.
  select id
  into existing_inventory_id
  from public.mindful_inventory_vehicles
  where source_evaluation_id = evaluation_row.id
  limit 1;

  if existing_inventory_id is not null then
    update public.auction_evaluations
    set
      status = 'purchased',
      updated_by = requesting_user_id,
      updated_at = now()
    where id = evaluation_row.id;

    return query
    select
      evaluation_row.id,
      existing_inventory_id,
      'purchased'::text,
      false;

    return;
  end if;

  resolved_year := evaluation_row.year;
  resolved_make := nullif(trim(evaluation_row.make), '');
  resolved_model := nullif(trim(evaluation_row.model), '');
  resolved_trim := nullif(trim(evaluation_row.trim), '');

  if resolved_year is null then
    raise exception 'Evaluation is missing vehicle year.';
  end if;

  if resolved_make is null then
    raise exception 'Evaluation is missing vehicle make.';
  end if;

  if resolved_model is null then
    raise exception 'Evaluation is missing vehicle model.';
  end if;

  -- The evaluation's current bid is the best available acquisition
  -- figure at the moment of status conversion. It remains editable
  -- inside Inventory after import.
  resolved_purchase_price :=
    greatest(coalesce(evaluation_row.current_bid, 0), 0);

  resolved_expected_sale_price :=
    case
      when evaluation_row.target_resale_used is null then null
      else greatest(evaluation_row.target_resale_used, 0)
    end;

  insert into public.mindful_inventory_vehicles (
    company_id,
    source_evaluation_id,

    vin,
    year,
    make,
    model,
    trim,
    mileage,

    purchase_date,
    purchase_price,
    buyer_fees,
    transport_cost,
    other_acquisition_cost,

    stage,
    title_status,
    expected_sale_price,

    next_action,

    source_snapshot,

    created_by,
    updated_by
  )
  values (
    requested_company_id,
    evaluation_row.id,

    evaluation_row.vin,
    resolved_year,
    resolved_make,
    resolved_model,
    resolved_trim,
    evaluation_row.mileage,

    current_date,
    resolved_purchase_price,
    0,
    0,
    0,

    'purchased',
    'unknown',
    resolved_expected_sale_price,

    'Confirm acquisition costs and receive vehicle',

    jsonb_build_object(
      'source', 'lot_logic_evaluation',
      'evaluationId', evaluation_row.id,
      'vehicleTitle', evaluation_row.vehicle_title,
      'auctionSite', evaluation_row.auction_site,
      'auctionUrl', evaluation_row.auction_url,
      'currentBid', evaluation_row.current_bid,
      'targetResaleUsed', evaluation_row.target_resale_used,
      'safeBid', evaluation_row.safe_bid,
      'maxSmartBid', evaluation_row.max_smart_bid,
      'stretchBid', evaluation_row.stretch_bid,
      'expectedGrossProfit', evaluation_row.expected_gross_profit,
      'decision', evaluation_row.decision,
      'riskGrade', evaluation_row.risk_grade,
      'evaluationStatusBeforeImport', evaluation_row.status,
      'importedAt', now()
    ),

    requesting_user_id,
    requesting_user_id
  )
  returning id into new_inventory_id;

  insert into public.mindful_inventory_activity (
    inventory_vehicle_id,
    action,
    description,
    actor_user_id,
    metadata
  )
  values (
    new_inventory_id,
    'imported_from_evaluation',
    'Vehicle added from a Lot Logic evaluation.',
    requesting_user_id,
    jsonb_build_object(
      'evaluationId', evaluation_row.id
    )
  );

  update public.auction_evaluations
  set
    status = 'purchased',
    updated_by = requesting_user_id,
    updated_at = now()
  where id = evaluation_row.id;

  return query
  select
    evaluation_row.id,
    new_inventory_id,
    'purchased'::text,
    true;
end;
$$;

revoke all
on function public.purchase_evaluation_and_add_to_inventory(
  uuid,
  uuid,
  uuid
)
from public;

grant execute
on function public.purchase_evaluation_and_add_to_inventory(
  uuid,
  uuid,
  uuid
)
to service_role;
