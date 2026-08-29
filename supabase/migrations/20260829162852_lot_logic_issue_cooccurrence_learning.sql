create or replace function private.lot_logic_normalized_issue_key(
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
      lower(coalesce(nullif(trim(p_subcategory), ''), nullif(trim(p_title), ''), 'unknown_issue')),
      '[^a-z0-9]+',
      '_',
      'g'
    )),
    160
  );
$$;

revoke all on function private.lot_logic_normalized_issue_key(text, text) from public;

create or replace function private.refresh_lot_logic_issue_pair(
  p_company_id uuid,
  p_primary_key text,
  p_related_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opportunities integer;
  v_occurrences integer;
  v_probability numeric(5,4);
  v_confidence numeric(5,4);
begin
  if p_primary_key is null or p_related_key is null or p_primary_key = p_related_key then
    return;
  end if;

  select count(distinct f.vehicle_id)
    into v_opportunities
  from public.mindful_inventory_findings f
  join public.mindful_inventory_vehicles v on v.id = f.vehicle_id
  where v.company_id = p_company_id
    and private.lot_logic_normalized_issue_key(f.subcategory, f.title) = p_primary_key;

  select count(distinct f1.vehicle_id)
    into v_occurrences
  from public.mindful_inventory_findings f1
  join public.mindful_inventory_vehicles v on v.id = f1.vehicle_id
  where v.company_id = p_company_id
    and private.lot_logic_normalized_issue_key(f1.subcategory, f1.title) = p_primary_key
    and exists (
      select 1
      from public.mindful_inventory_findings f2
      where f2.vehicle_id = f1.vehicle_id
        and private.lot_logic_normalized_issue_key(f2.subcategory, f2.title) = p_related_key
    );

  if coalesce(v_occurrences, 0) < 2 or coalesce(v_opportunities, 0) = 0 then
    return;
  end if;

  v_probability := least(1.0, v_occurrences::numeric / v_opportunities::numeric);
  v_confidence := least(1.0, v_opportunities::numeric / 10.0);

  insert into public.lot_logic_intelligence_issue_relations (
    company_id,
    primary_issue_key,
    related_issue_key,
    relation_type,
    vehicle_scope,
    occurrence_count,
    opportunity_count,
    conditional_probability,
    confidence,
    first_observed_at,
    last_observed_at,
    evidence,
    updated_at
  ) values (
    p_company_id,
    p_primary_key,
    p_related_key,
    'co_occurrence',
    '{}'::jsonb,
    v_occurrences,
    v_opportunities,
    v_probability,
    v_confidence,
    now(),
    now(),
    jsonb_build_array(jsonb_build_object(
      'generatedBy', 'finding_cooccurrence_trigger',
      'occurrences', v_occurrences,
      'opportunities', v_opportunities
    )),
    now()
  )
  on conflict (company_id, primary_issue_key, related_issue_key, relation_type)
  do update set
    occurrence_count = excluded.occurrence_count,
    opportunity_count = excluded.opportunity_count,
    conditional_probability = excluded.conditional_probability,
    confidence = excluded.confidence,
    last_observed_at = excluded.last_observed_at,
    evidence = excluded.evidence,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function private.refresh_lot_logic_issue_pair(uuid, text, text) from public;

create or replace function private.capture_lot_logic_issue_cooccurrence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_primary_key text;
  v_related_key text;
begin
  select v.company_id
    into v_company_id
  from public.mindful_inventory_vehicles v
  where v.id = new.vehicle_id;

  if v_company_id is null then
    return new;
  end if;

  v_primary_key := private.lot_logic_normalized_issue_key(new.subcategory, new.title);

  for v_related_key in
    select distinct private.lot_logic_normalized_issue_key(f.subcategory, f.title)
    from public.mindful_inventory_findings f
    where f.vehicle_id = new.vehicle_id
      and f.id <> new.id
      and private.lot_logic_normalized_issue_key(f.subcategory, f.title) <> v_primary_key
  loop
    perform private.refresh_lot_logic_issue_pair(v_company_id, v_primary_key, v_related_key);
    perform private.refresh_lot_logic_issue_pair(v_company_id, v_related_key, v_primary_key);
  end loop;

  return new;
end;
$$;

revoke all on function private.capture_lot_logic_issue_cooccurrence() from public;

drop trigger if exists trg_capture_lot_logic_issue_cooccurrence on public.mindful_inventory_findings;
create trigger trg_capture_lot_logic_issue_cooccurrence
after insert or update of vehicle_id, title, subcategory on public.mindful_inventory_findings
for each row execute function private.capture_lot_logic_issue_cooccurrence();
