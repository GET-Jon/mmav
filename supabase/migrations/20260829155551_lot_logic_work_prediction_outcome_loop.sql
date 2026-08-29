create or replace function private.capture_lot_logic_work_prediction()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_evaluation_id uuid;
  v_subject_key text;
  v_plan public.mindful_inventory_plan_items%rowtype;
  v_labor_minutes integer;
  v_elapsed_minutes integer;
begin
  select company_id into v_company_id
  from public.mindful_inventory_vehicles
  where id = new.vehicle_id;

  select * into v_plan
  from public.mindful_inventory_plan_items
  where id = new.plan_item_id;

  if v_company_id is null or v_plan.id is null then
    return new;
  end if;

  if new.finding_id is not null then
    select source_evaluation_id into v_evaluation_id
    from public.mindful_inventory_findings
    where id = new.finding_id;
  end if;

  v_subject_key := left(
    trim(both '_' from lower(regexp_replace(
      concat_ws(' ', v_plan.category, v_plan.subcategory, v_plan.title),
      '[^a-zA-Z0-9]+', '_', 'g'
    ))),
    160
  );

  v_labor_minutes := case
    when v_plan.estimated_labor_hours is not null then round(v_plan.estimated_labor_hours * 60)::integer
    when v_plan.estimated_duration_hours is not null then round(v_plan.estimated_duration_hours * 60)::integer
    else null
  end;

  v_elapsed_minutes := case
    when v_plan.estimated_elapsed_hours is not null then round(v_plan.estimated_elapsed_hours * 60)::integer
    when v_plan.estimated_duration_hours is not null then round(v_plan.estimated_duration_hours * 60)::integer
    else null
  end;

  if v_plan.estimated_cost_low is not null
     or v_plan.estimated_cost_high is not null
     or coalesce(v_plan.planning_amount, 0) > 0 then
    insert into public.lot_logic_intelligence_prediction_snapshots (
      company_id, evaluation_id, vehicle_id, finding_id, plan_item_id, work_order_id,
      prediction_type, subject_key, predicted_cost_low, predicted_cost_high,
      predicted_value, confidence, context_snapshot, created_by
    ) values (
      v_company_id, v_evaluation_id, new.vehicle_id, new.finding_id, new.plan_item_id, new.id,
      'work_cost', v_subject_key, v_plan.estimated_cost_low, v_plan.estimated_cost_high,
      jsonb_build_object(
        'planningAmount', v_plan.planning_amount,
        'costSource', v_plan.cost_source,
        'costSourceDetail', v_plan.cost_source_detail
      ),
      v_plan.confidence,
      jsonb_build_object(
        'category', v_plan.category,
        'subcategory', v_plan.subcategory,
        'classification', v_plan.classification,
        'title', v_plan.title,
        'assumptions', v_plan.assumptions,
        'source', 'approved_plan_item'
      ),
      new.created_by
    );
  end if;

  if v_labor_minutes is not null or v_elapsed_minutes is not null then
    insert into public.lot_logic_intelligence_prediction_snapshots (
      company_id, evaluation_id, vehicle_id, finding_id, plan_item_id, work_order_id,
      prediction_type, subject_key, predicted_labor_minutes, predicted_elapsed_minutes,
      predicted_value, confidence, context_snapshot, created_by
    ) values (
      v_company_id, v_evaluation_id, new.vehicle_id, new.finding_id, new.plan_item_id, new.id,
      'work_duration', v_subject_key, v_labor_minutes, v_elapsed_minutes,
      jsonb_build_object('sourceDurationHours', v_plan.estimated_duration_hours),
      v_plan.confidence,
      jsonb_build_object(
        'category', v_plan.category,
        'subcategory', v_plan.subcategory,
        'classification', v_plan.classification,
        'title', v_plan.title,
        'source', 'approved_plan_item'
      ),
      new.created_by
    );
  end if;

  if v_plan.suggested_partner_id is not null then
    insert into public.lot_logic_intelligence_prediction_snapshots (
      company_id, evaluation_id, vehicle_id, finding_id, plan_item_id, work_order_id,
      prediction_type, subject_key, predicted_partner_id,
      predicted_value, confidence, context_snapshot, created_by
    ) values (
      v_company_id, v_evaluation_id, new.vehicle_id, new.finding_id, new.plan_item_id, new.id,
      'partner', v_subject_key, v_plan.suggested_partner_id,
      jsonb_build_object('assignedPartnerAtCreation', new.assigned_partner_id),
      v_plan.confidence,
      jsonb_build_object(
        'category', v_plan.category,
        'subcategory', v_plan.subcategory,
        'title', v_plan.title,
        'source', 'approved_plan_item'
      ),
      new.created_by
    );
  end if;

  return new;
end;
$$;

revoke all on function private.capture_lot_logic_work_prediction() from public;

drop trigger if exists trg_capture_lot_logic_work_prediction on public.mindful_inventory_work_orders;
create trigger trg_capture_lot_logic_work_prediction
after insert on public.mindful_inventory_work_orders
for each row execute function private.capture_lot_logic_work_prediction();

create or replace function private.capture_lot_logic_work_outcome()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_partner_estimate_id uuid;
  v_actual_partner_id uuid;
  v_elapsed_minutes integer;
  v_prediction record;
  v_predicted_cost numeric;
  v_variance jsonb;
begin
  if new.status::text <> 'complete' then
    return new;
  end if;

  select company_id into v_company_id
  from public.mindful_inventory_vehicles
  where id = new.vehicle_id;

  if v_company_id is null then
    return new;
  end if;

  v_actual_partner_id := coalesce(new.completed_by_partner_id, new.assigned_partner_id);

  if v_actual_partner_id is not null then
    select id into v_partner_estimate_id
    from public.lot_logic_partner_blind_estimates
    where work_order_id = new.id
      and partner_id = v_actual_partner_id
    order by revision_no desc, submitted_at desc
    limit 1;
  end if;

  if new.actual_start_at is not null and new.actual_end_at is not null then
    v_elapsed_minutes := greatest(
      0,
      round(extract(epoch from (new.actual_end_at - new.actual_start_at)) / 60)::integer
    );
  end if;

  for v_prediction in
    select *
    from public.lot_logic_intelligence_prediction_snapshots
    where work_order_id = new.id
  loop
    v_predicted_cost := case
      when v_prediction.predicted_cost_low is not null and v_prediction.predicted_cost_high is not null
        then (v_prediction.predicted_cost_low + v_prediction.predicted_cost_high) / 2
      else coalesce(v_prediction.predicted_cost_low, v_prediction.predicted_cost_high)
    end;

    v_variance := jsonb_strip_nulls(jsonb_build_object(
      'costVsPrediction', case
        when new.actual_cost is not null and v_predicted_cost is not null
          then new.actual_cost - v_predicted_cost
        else null
      end,
      'laborMinutesVsPrediction', case
        when new.actual_labor_minutes is not null and v_prediction.predicted_labor_minutes is not null
          then new.actual_labor_minutes - v_prediction.predicted_labor_minutes
        else null
      end,
      'elapsedMinutesVsPrediction', case
        when v_elapsed_minutes is not null and v_prediction.predicted_elapsed_minutes is not null
          then v_elapsed_minutes - v_prediction.predicted_elapsed_minutes
        else null
      end
    ));

    insert into public.lot_logic_intelligence_prediction_outcomes (
      company_id,
      prediction_snapshot_id,
      partner_estimate_id,
      actual_partner_id,
      actual_cost,
      actual_labor_minutes,
      actual_elapsed_minutes,
      outcome_value,
      variance,
      resolved_at
    ) values (
      v_company_id,
      v_prediction.id,
      v_partner_estimate_id,
      v_actual_partner_id,
      new.actual_cost,
      new.actual_labor_minutes,
      v_elapsed_minutes,
      jsonb_strip_nulls(jsonb_build_object(
        'difficulty', new.difficulty,
        'difficultyReason', new.difficulty_reason,
        'completionNotes', new.completion_notes,
        'completedByPartnerId', new.completed_by_partner_id,
        'completedByUserId', new.completed_by_user_id
      )),
      v_variance,
      now()
    )
    on conflict (prediction_snapshot_id) do update set
      partner_estimate_id = excluded.partner_estimate_id,
      actual_partner_id = excluded.actual_partner_id,
      actual_cost = excluded.actual_cost,
      actual_labor_minutes = excluded.actual_labor_minutes,
      actual_elapsed_minutes = excluded.actual_elapsed_minutes,
      outcome_value = excluded.outcome_value,
      variance = excluded.variance,
      resolved_at = excluded.resolved_at;
  end loop;

  return new;
end;
$$;

revoke all on function private.capture_lot_logic_work_outcome() from public;

drop trigger if exists trg_capture_lot_logic_work_outcome on public.mindful_inventory_work_orders;
create trigger trg_capture_lot_logic_work_outcome
after update of status, actual_cost, actual_labor_minutes, actual_start_at, actual_end_at,
  completed_by_partner_id, completed_by_user_id, difficulty, difficulty_reason, completion_notes
on public.mindful_inventory_work_orders
for each row execute function private.capture_lot_logic_work_outcome();
