-- Restore the complete Lot Logic workflow in local/reset environments.
--
-- Production already has public.auction_evaluations. This migration is
-- intentionally additive/idempotent: it creates the evaluator table only when
-- it is missing, then (re)installs the current Inventory purchase handoff RPC.
--
-- Resulting local workflow:
--   Evaluator -> auction_evaluations -> Pipeline -> Inventory

create table if not exists public.auction_evaluations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  status text not null default 'draft',

  vin text,
  vehicle_title text,
  year integer,
  make text,
  model text,
  trim text,
  mileage integer,

  auction_site text,
  auction_url text,
  auction_ends_at timestamptz,

  current_bid numeric(12,2),
  target_resale_used numeric(12,2),
  safe_bid numeric(12,2),
  max_smart_bid numeric(12,2),
  stretch_bid numeric(12,2),
  expected_gross_profit numeric(12,2),

  decision text,
  risk_grade text,

  payload jsonb not null default '{}'::jsonb,

  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists auction_evaluations_company_updated_idx
  on public.auction_evaluations(company_id, updated_at desc);

create index if not exists auction_evaluations_company_status_idx
  on public.auction_evaluations(company_id, status);

create or replace function public.set_auction_evaluation_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists auction_evaluations_set_updated_at
  on public.auction_evaluations;

create trigger auction_evaluations_set_updated_at
before update on public.auction_evaluations
for each row
execute function public.set_auction_evaluation_updated_at();

-- Evaluator/Pipeline routes use the server-side admin client, while the purchase
-- handoff below performs its own company membership check.
grant select, insert, update, delete
on public.auction_evaluations
to service_role;

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
  condition_analysis jsonb;
  condition_issue jsonb;
  issue_index integer := 0;
  resolved_issue_id text;
  resolved_description text;
  resolved_category text;
  resolved_severity public.mindful_inventory_finding_severity;
  resolved_certainty text;
  resolved_confidence text;
  resolved_cost_low numeric(12,2);
  resolved_cost_high numeric(12,2);
  resolved_duration_hours numeric(8,2);
begin
  if not public.is_company_member(requested_company_id, requesting_user_id) then
    raise exception 'Company membership required.';
  end if;

  select *
  into evaluation_row
  from public.auction_evaluations
  where id = evaluation_id
    and company_id = requested_company_id
  for update;

  if not found then
    raise exception 'Evaluation not found.';
  end if;

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
    select evaluation_row.id, existing_inventory_id, 'purchased'::text, false;
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

  resolved_purchase_price := greatest(coalesce(evaluation_row.current_bid, 0), 0);
  resolved_expected_sale_price := case
    when evaluation_row.target_resale_used is null then null
    else greatest(evaluation_row.target_resale_used, 0)
  end;

  condition_analysis := coalesce(evaluation_row.payload -> 'conditionAnalysis', '{}'::jsonb);

  insert into public.mindful_inventory_vehicles (
    company_id,
    source_evaluation_id,
    source_snapshot,
    vin,
    year,
    make,
    model,
    trim,
    mileage,
    project_owner_user_id,
    phase,
    priority,
    health,
    next_action,
    next_action_owner_user_id,
    purchase_date,
    purchase_price,
    buyer_fees,
    transport_cost,
    other_acquisition_cost,
    expected_sale_price,
    title_status,
    created_by,
    updated_by
  )
  values (
    requested_company_id,
    evaluation_row.id,
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
      'conditionAnalysisApplied', coalesce((evaluation_row.payload ->> 'conditionAnalysisApplied')::boolean, false),
      'conditionPlanningEstimateOverride', evaluation_row.payload -> 'conditionPlanningEstimateOverride',
      'conditionReadyDaysLowOverride', evaluation_row.payload -> 'conditionReadyDaysLowOverride',
      'conditionReadyDaysHighOverride', evaluation_row.payload -> 'conditionReadyDaysHighOverride',
      'conditionAnalysis', condition_analysis,
      'conditionSourceText', evaluation_row.payload ->> 'conditionSourceText',
      'importedAt', now()
    ),
    evaluation_row.vin,
    resolved_year,
    resolved_make,
    resolved_model,
    resolved_trim,
    evaluation_row.mileage,
    requesting_user_id,
    'purchased',
    '2',
    'on_track',
    'Complete Overview / Intake',
    requesting_user_id,
    current_date,
    resolved_purchase_price,
    0,
    0,
    0,
    resolved_expected_sale_price,
    'unknown',
    requesting_user_id,
    requesting_user_id
  )
  returning id into new_inventory_id;

  -- Preserve explicitly-applied evaluator AI observations as Findings only.
  if coalesce((evaluation_row.payload ->> 'conditionAnalysisApplied')::boolean, false) then
    for condition_issue in
      select value
      from jsonb_array_elements(coalesce(condition_analysis -> 'issues', '[]'::jsonb))
    loop
      if coalesce((condition_issue ->> 'includeInValuation')::boolean, false) then
        issue_index := issue_index + 1;
        resolved_issue_id := coalesce(nullif(trim(condition_issue ->> 'id'), ''), 'issue-' || issue_index::text);
        resolved_description := coalesce(nullif(trim(condition_issue ->> 'description'), ''), 'Review evaluator condition observation');
        resolved_certainty := nullif(trim(condition_issue ->> 'certainty'), '');
        resolved_confidence := nullif(trim(condition_issue ->> 'confidence'), '');

        resolved_category := case condition_issue ->> 'category'
          when 'mechanical' then 'mechanical'
          when 'wear' then 'maintenance'
          when 'cosmetic' then 'cosmetic'
          when 'transportation' then 'transportation'
          when 'inspection' then 'inspection'
          when 'structural' then 'structural'
          when 'history' then 'history'
          when 'title' then 'title_registration'
          else 'other'
        end;

        resolved_severity := case condition_issue ->> 'severity'
          when 'severe' then 'red'::public.mindful_inventory_finding_severity
          when 'moderate' then 'yellow'::public.mindful_inventory_finding_severity
          else 'green'::public.mindful_inventory_finding_severity
        end;

        resolved_cost_low := greatest(coalesce(nullif(condition_issue ->> 'estimatedCostLow', '')::numeric, 0), 0);
        resolved_cost_high := greatest(
          coalesce(
            nullif(condition_issue ->> 'estimatedCostHigh', '')::numeric,
            nullif(condition_issue ->> 'planningEstimate', '')::numeric,
            resolved_cost_low
          ),
          0
        );
        resolved_duration_hours := greatest(
          coalesce(nullif(condition_issue ->> 'estimatedDurationDays', '')::numeric, 0) * 8,
          0
        );

        insert into public.mindful_inventory_findings (
          vehicle_id,
          source,
          source_user_id,
          source_evaluation_id,
          source_reference,
          title,
          description,
          category,
          severity,
          confidence,
          certainty,
          estimated_cost_low,
          estimated_cost_high,
          estimated_duration_hours,
          status
        )
        values (
          new_inventory_id,
          'ai',
          requesting_user_id,
          evaluation_row.id,
          resolved_issue_id,
          resolved_description,
          nullif(trim(condition_issue ->> 'sourceText'), ''),
          resolved_category,
          resolved_severity,
          resolved_confidence,
          resolved_certainty,
          resolved_cost_low,
          resolved_cost_high,
          resolved_duration_hours,
          'open'
        );
      end if;
    end loop;
  end if;

  insert into public.mindful_inventory_history (
    company_id,
    vehicle_id,
    event_type,
    entity_type,
    entity_id,
    actor_user_id,
    summary,
    metadata
  )
  values (
    requested_company_id,
    new_inventory_id,
    'vehicle_purchased',
    'vehicle',
    new_inventory_id,
    requesting_user_id,
    'Vehicle purchased and added to Inventory Operations.',
    jsonb_build_object(
      'evaluationId', evaluation_row.id,
      'evaluatorFindingsImported', issue_index
    )
  );

  update public.auction_evaluations
  set
    status = 'purchased',
    updated_by = requesting_user_id,
    updated_at = now()
  where id = evaluation_row.id;

  return query
  select evaluation_row.id, new_inventory_id, 'purchased'::text, true;
end;
$$;

revoke all
on function public.purchase_evaluation_and_add_to_inventory(uuid, uuid, uuid)
from public;

grant execute
on function public.purchase_evaluation_and_add_to_inventory(uuid, uuid, uuid)
to service_role;
