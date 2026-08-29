create or replace function private.lot_logic_normalized_work_key(
  p_category text,
  p_subcategory text,
  p_title text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    trim(both '_' from regexp_replace(
      lower(concat_ws('_',
        nullif(trim(p_category), ''),
        coalesce(nullif(trim(p_subcategory), ''), nullif(trim(p_title), ''))
      )),
      '[^a-z0-9]+',
      '_',
      'g'
    )),
    160
  );
$$;

revoke all on function private.lot_logic_normalized_work_key(text, text, text) from public;

create or replace function private.refresh_lot_logic_work_performance(
  p_company_id uuid,
  p_work_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sample_size integer;
  v_cost_count integer;
  v_median_cost numeric;
  v_avg_cost numeric;
  v_median_labor numeric;
  v_median_elapsed numeric;
  v_dominant_partner_id uuid;
  v_dominant_partner_name text;
  v_dominant_count integer;
  v_partner_sample integer;
  v_partner_share numeric(5,4);
  v_confidence numeric(5,4);
  v_assertion_id uuid;
begin
  select
    count(*),
    count(w.actual_cost),
    percentile_cont(0.5) within group (order by w.actual_cost) filter (where w.actual_cost is not null),
    avg(w.actual_cost) filter (where w.actual_cost is not null),
    percentile_cont(0.5) within group (order by w.actual_labor_minutes) filter (where w.actual_labor_minutes is not null),
    percentile_cont(0.5) within group (
      order by extract(epoch from (w.actual_end_at - w.actual_start_at)) / 60.0
    ) filter (where w.actual_start_at is not null and w.actual_end_at is not null)
  into
    v_sample_size,
    v_cost_count,
    v_median_cost,
    v_avg_cost,
    v_median_labor,
    v_median_elapsed
  from public.mindful_inventory_work_orders w
  join public.mindful_inventory_vehicles v on v.id = w.vehicle_id
  where v.company_id = p_company_id
    and w.status = 'complete'
    and private.lot_logic_normalized_work_key(w.category, w.subcategory, w.title) = p_work_key;

  if coalesce(v_sample_size, 0) >= 2 then
    v_confidence := least(1.0, v_sample_size::numeric / 10.0);

    select a.id
      into v_assertion_id
    from public.lot_logic_intelligence_assertions a
    where a.company_id = p_company_id
      and a.assertion_type = 'cost_pattern'
      and a.subject_type = 'work_type'
      and a.subject_key = p_work_key
      and a.predicate = 'historical_work_actuals'
      and a.provenance_type = 'calculated'
      and a.status = 'active'
    order by a.updated_at desc
    limit 1;

    if v_assertion_id is null then
      insert into public.lot_logic_intelligence_assertions (
        company_id,
        assertion_type,
        subject_type,
        subject_key,
        predicate,
        value,
        provenance_type,
        status,
        confidence,
        sample_size,
        supporting_count,
        contradicting_count,
        first_observed_at,
        last_observed_at,
        requires_validation,
        evidence
      ) values (
        p_company_id,
        'cost_pattern',
        'work_type',
        p_work_key,
        'historical_work_actuals',
        jsonb_strip_nulls(jsonb_build_object(
          'medianActualCost', v_median_cost,
          'averageActualCost', v_avg_cost,
          'costObservationCount', v_cost_count,
          'medianLaborMinutes', v_median_labor,
          'medianElapsedMinutes', v_median_elapsed
        )),
        'calculated',
        'active',
        v_confidence,
        v_sample_size,
        v_sample_size,
        0,
        now(),
        now(),
        false,
        jsonb_build_array(jsonb_build_object(
          'generatedBy', 'work_completion_learning',
          'sampleSize', v_sample_size
        ))
      );
    else
      update public.lot_logic_intelligence_assertions
      set
        value = jsonb_strip_nulls(jsonb_build_object(
          'medianActualCost', v_median_cost,
          'averageActualCost', v_avg_cost,
          'costObservationCount', v_cost_count,
          'medianLaborMinutes', v_median_labor,
          'medianElapsedMinutes', v_median_elapsed
        )),
        confidence = v_confidence,
        sample_size = v_sample_size,
        supporting_count = v_sample_size,
        contradicting_count = 0,
        last_observed_at = now(),
        evidence = jsonb_build_array(jsonb_build_object(
          'generatedBy', 'work_completion_learning',
          'sampleSize', v_sample_size
        )),
        updated_at = now()
      where id = v_assertion_id;
    end if;
  end if;

  select count(*)
    into v_partner_sample
  from public.mindful_inventory_work_orders w
  join public.mindful_inventory_vehicles v on v.id = w.vehicle_id
  where v.company_id = p_company_id
    and w.status = 'complete'
    and coalesce(w.completed_by_partner_id, w.assigned_partner_id) is not null
    and private.lot_logic_normalized_work_key(w.category, w.subcategory, w.title) = p_work_key;

  if coalesce(v_partner_sample, 0) >= 3 then
    select
      coalesce(w.completed_by_partner_id, w.assigned_partner_id) as partner_id,
      p.name,
      count(*) as completed_count
    into v_dominant_partner_id, v_dominant_partner_name, v_dominant_count
    from public.mindful_inventory_work_orders w
    join public.mindful_inventory_vehicles v on v.id = w.vehicle_id
    join public.mindful_inventory_partners p
      on p.id = coalesce(w.completed_by_partner_id, w.assigned_partner_id)
    where v.company_id = p_company_id
      and w.status = 'complete'
      and coalesce(w.completed_by_partner_id, w.assigned_partner_id) is not null
      and private.lot_logic_normalized_work_key(w.category, w.subcategory, w.title) = p_work_key
    group by coalesce(w.completed_by_partner_id, w.assigned_partner_id), p.name
    order by count(*) desc, p.name
    limit 1;

    v_partner_share := least(1.0, v_dominant_count::numeric / v_partner_sample::numeric);
    v_confidence := least(1.0, v_partner_sample::numeric / 10.0);

    select a.id
      into v_assertion_id
    from public.lot_logic_intelligence_assertions a
    where a.company_id = p_company_id
      and a.assertion_type = 'partner_pattern'
      and a.subject_type = 'work_type'
      and a.subject_key = p_work_key
      and a.predicate = 'dominant_actual_partner'
      and a.provenance_type = 'calculated'
      and a.status = 'active'
    order by a.updated_at desc
    limit 1;

    if v_assertion_id is null then
      insert into public.lot_logic_intelligence_assertions (
        company_id,
        assertion_type,
        subject_type,
        subject_key,
        predicate,
        value,
        provenance_type,
        status,
        confidence,
        sample_size,
        supporting_count,
        contradicting_count,
        first_observed_at,
        last_observed_at,
        requires_validation,
        evidence
      ) values (
        p_company_id,
        'partner_pattern',
        'work_type',
        p_work_key,
        'dominant_actual_partner',
        jsonb_build_object(
          'partnerId', v_dominant_partner_id,
          'partnerName', v_dominant_partner_name,
          'completedJobs', v_dominant_count,
          'share', v_partner_share
        ),
        'calculated',
        'active',
        v_confidence,
        v_partner_sample,
        v_dominant_count,
        v_partner_sample - v_dominant_count,
        now(),
        now(),
        false,
        jsonb_build_array(jsonb_build_object(
          'generatedBy', 'work_completion_learning',
          'partnerId', v_dominant_partner_id,
          'completedJobs', v_dominant_count,
          'sampleSize', v_partner_sample
        ))
      );
    else
      update public.lot_logic_intelligence_assertions
      set
        value = jsonb_build_object(
          'partnerId', v_dominant_partner_id,
          'partnerName', v_dominant_partner_name,
          'completedJobs', v_dominant_count,
          'share', v_partner_share
        ),
        confidence = v_confidence,
        sample_size = v_partner_sample,
        supporting_count = v_dominant_count,
        contradicting_count = v_partner_sample - v_dominant_count,
        last_observed_at = now(),
        evidence = jsonb_build_array(jsonb_build_object(
          'generatedBy', 'work_completion_learning',
          'partnerId', v_dominant_partner_id,
          'completedJobs', v_dominant_count,
          'sampleSize', v_partner_sample
        )),
        updated_at = now()
      where id = v_assertion_id;
    end if;

    if v_partner_share >= 0.70 and not exists (
      select 1
      from public.lot_logic_intelligence_insights i
      where i.company_id = p_company_id
        and i.insight_type = 'partner_preference'
        and i.suggested_action ->> 'subjectKey' = p_work_key
        and i.status in ('pending', 'validated', 'keep_observing')
    ) then
      insert into public.lot_logic_intelligence_insights (
        company_id,
        insight_type,
        title,
        summary,
        confidence,
        sample_size,
        evidence,
        suggested_action,
        status
      ) values (
        p_company_id,
        'partner_preference',
        'Emerging partner preference',
        format('%s completed %s of %s recent %s jobs (%s%%).',
          v_dominant_partner_name,
          v_dominant_count,
          v_partner_sample,
          replace(p_work_key, '_', ' '),
          round(v_partner_share * 100)
        ),
        v_confidence,
        v_partner_sample,
        jsonb_build_array(jsonb_build_object(
          'generatedBy', 'work_completion_learning',
          'partnerId', v_dominant_partner_id,
          'completedJobs', v_dominant_count,
          'sampleSize', v_partner_sample,
          'share', v_partner_share
        )),
        jsonb_build_object(
          'action', 'prefer_partner',
          'subjectKey', p_work_key,
          'partnerId', v_dominant_partner_id,
          'partnerName', v_dominant_partner_name
        ),
        'pending'
      );
    end if;
  end if;
end;
$$;

revoke all on function private.refresh_lot_logic_work_performance(uuid, text) from public;

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

  if tg_op = 'UPDATE' and old.status = 'complete'
     and old.actual_cost is not distinct from new.actual_cost
     and old.actual_labor_minutes is not distinct from new.actual_labor_minutes
     and old.actual_start_at is not distinct from new.actual_start_at
     and old.actual_end_at is not distinct from new.actual_end_at
     and old.completed_by_partner_id is not distinct from new.completed_by_partner_id
     and old.assigned_partner_id is not distinct from new.assigned_partner_id then
    return new;
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

drop trigger if exists trg_capture_lot_logic_work_performance on public.mindful_inventory_work_orders;
create trigger trg_capture_lot_logic_work_performance
after insert or update of status, actual_cost, actual_labor_minutes, actual_start_at, actual_end_at, completed_by_partner_id, assigned_partner_id
on public.mindful_inventory_work_orders
for each row execute function private.capture_lot_logic_work_performance();
