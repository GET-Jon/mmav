create or replace function private.capture_lot_logic_evaluator_vehicle_outcomes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  bid_prediction public.lot_logic_intelligence_prediction_snapshots%rowtype;
  recon_prediction public.lot_logic_intelligence_prediction_snapshots%rowtype;
  predicted_max numeric;
  predicted_recon_planning numeric;
  predicted_recon_elapsed integer;
  actual_recon_cost numeric;
  actual_recon_elapsed integer;
  first_work_start timestamptz;
  last_work_end timestamptz;
  completed_work_count integer;
  latest_qc_outcome public.mindful_inventory_qc_outcome;
begin
  if new.source_evaluation_id is null then
    return new;
  end if;

  select p.*
    into bid_prediction
  from public.lot_logic_intelligence_prediction_snapshots p
  where p.company_id = new.company_id
    and p.evaluation_id = new.source_evaluation_id
    and p.prediction_type = 'bid'
  order by p.created_at desc
  limit 1;

  if bid_prediction.id is not null then
    predicted_max := nullif(bid_prediction.predicted_value ->> 'maxSmartBid', '')::numeric;

    insert into public.lot_logic_intelligence_prediction_outcomes (
      company_id,
      prediction_snapshot_id,
      actual_cost,
      outcome_value,
      variance,
      resolved_at
    ) values (
      new.company_id,
      bid_prediction.id,
      new.purchase_price,
      jsonb_build_object(
        'stage', 'purchase',
        'vehicleId', new.id,
        'actualPurchasePrice', new.purchase_price,
        'buyerFees', new.buyer_fees,
        'transportCost', new.transport_cost,
        'otherAcquisitionCost', new.other_acquisition_cost
      ),
      jsonb_strip_nulls(jsonb_build_object(
        'purchasePriceVsMaxSmartBid', case when predicted_max is not null then new.purchase_price - predicted_max else null end,
        'withinMaxSmartBid', case when predicted_max is not null then new.purchase_price <= predicted_max else null end
      )),
      now()
    )
    on conflict (prediction_snapshot_id) do update set
      actual_cost = excluded.actual_cost,
      outcome_value = excluded.outcome_value,
      variance = excluded.variance,
      resolved_at = excluded.resolved_at;
  end if;

  if new.phase = 'ready' then
    select p.*
      into recon_prediction
    from public.lot_logic_intelligence_prediction_snapshots p
    where p.company_id = new.company_id
      and p.evaluation_id = new.source_evaluation_id
      and p.prediction_type = 'recon_total'
    order by p.created_at desc
    limit 1;

    if recon_prediction.id is not null then
      select
        sum(w.actual_cost),
        min(w.actual_start_at),
        max(w.actual_end_at),
        count(*) filter (where w.status = 'complete')
      into
        actual_recon_cost,
        first_work_start,
        last_work_end,
        completed_work_count
      from public.mindful_inventory_work_orders w
      where w.vehicle_id = new.id
        and w.status = 'complete';

      if first_work_start is not null and last_work_end is not null then
        actual_recon_elapsed := greatest(
          0,
          round(extract(epoch from (last_work_end - first_work_start)) / 60.0)::integer
        );
      else
        actual_recon_elapsed := null;
      end if;

      select q.outcome
        into latest_qc_outcome
      from public.mindful_inventory_qc_inspections q
      where q.vehicle_id = new.id
        and q.completed_at is not null
      order by q.completed_at desc
      limit 1;

      predicted_recon_planning := nullif(recon_prediction.predicted_value ->> 'planningEstimate', '')::numeric;
      predicted_recon_elapsed := recon_prediction.predicted_elapsed_minutes;

      insert into public.lot_logic_intelligence_prediction_outcomes (
        company_id,
        prediction_snapshot_id,
        actual_cost,
        actual_elapsed_minutes,
        qc_passed,
        outcome_value,
        variance,
        resolved_at
      ) values (
        new.company_id,
        recon_prediction.id,
        actual_recon_cost,
        actual_recon_elapsed,
        case
          when latest_qc_outcome is null then null
          when latest_qc_outcome in ('pass', 'manager_override') then true
          else false
        end,
        jsonb_build_object(
          'stage', 'ready',
          'vehicleId', new.id,
          'completedWorkOrders', coalesce(completed_work_count, 0),
          'firstWorkStart', first_work_start,
          'lastWorkEnd', last_work_end,
          'qcOutcome', latest_qc_outcome
        ),
        jsonb_strip_nulls(jsonb_build_object(
          'actualCostVsPlanning', case when predicted_recon_planning is not null and actual_recon_cost is not null then actual_recon_cost - predicted_recon_planning else null end,
          'actualCostVsLow', case when recon_prediction.predicted_cost_low is not null and actual_recon_cost is not null then actual_recon_cost - recon_prediction.predicted_cost_low else null end,
          'actualCostVsHigh', case when recon_prediction.predicted_cost_high is not null and actual_recon_cost is not null then actual_recon_cost - recon_prediction.predicted_cost_high else null end,
          'actualElapsedVsPredictedMinutes', case when predicted_recon_elapsed is not null and actual_recon_elapsed is not null then actual_recon_elapsed - predicted_recon_elapsed else null end
        )),
        now()
      )
      on conflict (prediction_snapshot_id) do update set
        actual_cost = excluded.actual_cost,
        actual_elapsed_minutes = excluded.actual_elapsed_minutes,
        qc_passed = excluded.qc_passed,
        outcome_value = excluded.outcome_value,
        variance = excluded.variance,
        resolved_at = excluded.resolved_at;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.capture_lot_logic_evaluator_vehicle_outcomes() from public;

drop trigger if exists trg_capture_lot_logic_evaluator_vehicle_insert on public.mindful_inventory_vehicles;
create trigger trg_capture_lot_logic_evaluator_vehicle_insert
after insert on public.mindful_inventory_vehicles
for each row execute function private.capture_lot_logic_evaluator_vehicle_outcomes();

drop trigger if exists trg_capture_lot_logic_evaluator_vehicle_update on public.mindful_inventory_vehicles;
create trigger trg_capture_lot_logic_evaluator_vehicle_update
after update of phase, purchase_price, buyer_fees, transport_cost, other_acquisition_cost on public.mindful_inventory_vehicles
for each row execute function private.capture_lot_logic_evaluator_vehicle_outcomes();
