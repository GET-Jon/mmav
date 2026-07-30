-- Import approved Lot Logic AI condition issues into Mindful Inventory.
--
-- Direction of data:
-- auction_evaluations.payload.conditionAnalysis
--   -> mindful_inventory_work_items
--
-- Inventory remains an isolated snapshot. Future evaluator changes do not
-- modify imported work items.

alter table public.mindful_inventory_work_items
  add column if not exists ai_generated boolean not null default false,
  add column if not exists ai_source_evaluation_id uuid,
  add column if not exists ai_source_issue_id text,
  add column if not exists ai_confidence text,
  add column if not exists ai_certainty text,
  add column if not exists estimated_cost_low numeric(12,2),
  add column if not exists estimated_cost_high numeric(12,2),
  add column if not exists estimated_duration_days integer,
  add column if not exists sequence_order integer,
  add column if not exists source_issue_text text,
  add column if not exists ai_assumptions jsonb not null default '[]'::jsonb;

create unique index if not exists
  mindful_inventory_work_items_ai_source_issue_unique_idx
on public.mindful_inventory_work_items(
  inventory_vehicle_id,
  ai_source_evaluation_id,
  ai_source_issue_id
)
where
  ai_generated = true
  and ai_source_evaluation_id is not null
  and ai_source_issue_id is not null;

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
  evaluation_row public.auction_evaluations%rowtype;
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
  resolved_priority text;
  resolved_certainty text;
  resolved_confidence text;
  resolved_status text;
  resolved_requires_approval boolean;
  resolved_estimated_cost numeric(12,2);
  resolved_estimated_cost_low numeric(12,2);
  resolved_estimated_cost_high numeric(12,2);
  resolved_duration_days integer;
  resolved_source_text text;
  resolved_assumptions jsonb;
begin
  if not exists (
    select 1
    from public.companies company
    where company.id = requested_company_id
      and company.slug = 'mindful-motor-co'
      and company.status = 'active'
  ) then
    raise exception 'Mindful Inventory access denied.';
  end if;

  if not public.is_company_member(
    requested_company_id,
    requesting_user_id
  ) then
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

  resolved_purchase_price :=
    greatest(coalesce(evaluation_row.current_bid, 0), 0);

  resolved_expected_sale_price :=
    case
      when evaluation_row.target_resale_used is null then null
      else greatest(evaluation_row.target_resale_used, 0)
    end;

  condition_analysis :=
    coalesce(evaluation_row.payload -> 'conditionAnalysis', '{}'::jsonb);

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

    case
      when jsonb_array_length(
        coalesce(condition_analysis -> 'issues', '[]'::jsonb)
      ) > 0
      then 'Review imported AI work plan'
      else 'Confirm acquisition costs and receive vehicle'
    end,

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
      'conditionAnalysisApplied',
        coalesce(
          (evaluation_row.payload ->> 'conditionAnalysisApplied')::boolean,
          false
        ),
      'conditionPlanningEstimateOverride',
        evaluation_row.payload -> 'conditionPlanningEstimateOverride',
      'conditionReadyDaysLowOverride',
        evaluation_row.payload -> 'conditionReadyDaysLowOverride',
      'conditionReadyDaysHighOverride',
        evaluation_row.payload -> 'conditionReadyDaysHighOverride',
      'conditionAnalysis', condition_analysis,
      'conditionSourceText',
        evaluation_row.payload ->> 'conditionSourceText',
      'importedAt', now()
    ),

    requesting_user_id,
    requesting_user_id
  )
  returning id into new_inventory_id;

  -- Import included AI issues only when the user explicitly applied
  -- the analysis in the evaluator.
  if coalesce(
    (evaluation_row.payload ->> 'conditionAnalysisApplied')::boolean,
    false
  ) then
    for condition_issue in
      select value
      from jsonb_array_elements(
        coalesce(condition_analysis -> 'issues', '[]'::jsonb)
      )
    loop
      if coalesce(
        (condition_issue ->> 'includeInValuation')::boolean,
        false
      ) then
        issue_index := issue_index + 1;

        resolved_issue_id :=
          coalesce(
            nullif(trim(condition_issue ->> 'id'), ''),
            'issue-' || issue_index::text
          );

        resolved_description :=
          coalesce(
            nullif(trim(condition_issue ->> 'description'), ''),
            'Review AI condition finding'
          );

        resolved_certainty :=
          coalesce(
            nullif(trim(condition_issue ->> 'certainty'), ''),
            'inspection_required'
          );

        resolved_confidence :=
          coalesce(
            nullif(trim(condition_issue ->> 'confidence'), ''),
            'low'
          );

        resolved_category :=
          case
            when resolved_certainty = 'inspection_required'
              then 'inspection'
            when condition_issue ->> 'category' = 'mechanical'
              then 'mechanical'
            when condition_issue ->> 'category' = 'wear'
              then 'maintenance'
            when condition_issue ->> 'category' = 'cosmetic'
              then 'cosmetic'
            when condition_issue ->> 'category' = 'transportation'
              then 'transportation'
            when condition_issue ->> 'category' = 'inspection'
              then 'inspection'
            when condition_issue ->> 'category' = 'structural'
              then 'inspection'
            when condition_issue ->> 'category' = 'history'
              then 'inspection'
            when condition_issue ->> 'category' = 'title'
              then 'title_registration'
            else 'other'
          end;

        resolved_priority :=
          case
            when condition_issue ->> 'severity' = 'severe'
              then 'required'
            when condition_issue ->> 'severity' = 'moderate'
              then 'recommended'
            else 'optional'
          end;

        resolved_status := 'awaiting_approval';
        resolved_requires_approval := true;

        resolved_estimated_cost :=
          greatest(
            coalesce(
              nullif(condition_issue ->> 'planningEstimate', '')::numeric,
              0
            ),
            0
          );

        resolved_estimated_cost_low :=
          greatest(
            coalesce(
              nullif(condition_issue ->> 'estimatedCostLow', '')::numeric,
              0
            ),
            0
          );

        resolved_estimated_cost_high :=
          greatest(
            coalesce(
              nullif(condition_issue ->> 'estimatedCostHigh', '')::numeric,
              resolved_estimated_cost
            ),
            0
          );

        resolved_duration_days :=
          greatest(
            coalesce(
              nullif(
                condition_issue ->> 'estimatedDurationDays',
                ''
              )::integer,
              0
            ),
            0
          );

        resolved_source_text :=
          nullif(trim(condition_issue ->> 'sourceText'), '');

        resolved_assumptions :=
          case
            when jsonb_typeof(condition_issue -> 'assumptions') = 'array'
              then condition_issue -> 'assumptions'
            else '[]'::jsonb
          end;

        insert into public.mindful_inventory_work_items (
          inventory_vehicle_id,
          description,
          category,
          priority,
          status,
          estimated_cost,
          requires_approval,
          notes,

          ai_generated,
          ai_source_evaluation_id,
          ai_source_issue_id,
          ai_confidence,
          ai_certainty,
          estimated_cost_low,
          estimated_cost_high,
          estimated_duration_days,
          sequence_order,
          source_issue_text,
          ai_assumptions,

          created_by,
          updated_by
        )
        values (
          new_inventory_id,
          resolved_description,
          resolved_category,
          resolved_priority,
          resolved_status,
          resolved_estimated_cost,
          resolved_requires_approval,
          case
            when resolved_certainty = 'inspection_required'
              then 'AI-generated inspection task. Confirm scope and cost before approval.'
            else 'AI-generated work item. Confirm scope and cost before approval.'
          end,

          true,
          evaluation_row.id,
          resolved_issue_id,
          resolved_confidence,
          resolved_certainty,
          resolved_estimated_cost_low,
          resolved_estimated_cost_high,
          resolved_duration_days,
          issue_index,
          resolved_source_text,
          resolved_assumptions,

          requesting_user_id,
          requesting_user_id
        )
        on conflict (
          inventory_vehicle_id,
          ai_source_evaluation_id,
          ai_source_issue_id
        )
        where
          ai_generated = true
          and ai_source_evaluation_id is not null
          and ai_source_issue_id is not null
        do nothing;
      end if;
    end loop;
  end if;

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
    case
      when issue_index > 0
        then format(
          'Vehicle added from Lot Logic with %s AI work items.',
          issue_index
        )
      else 'Vehicle added from a Lot Logic evaluation.'
    end,
    requesting_user_id,
    jsonb_build_object(
      'evaluationId', evaluation_row.id,
      'aiWorkItemsImported', issue_index
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
