create schema if not exists private;

create or replace function private.is_assigned_work_partner(p_work_order_id uuid, p_partner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.mindful_inventory_partners p
    join public.mindful_inventory_work_orders w
      on w.assigned_partner_id = p.id
    where p.id = p_partner_id
      and w.id = p_work_order_id
      and p.user_id = auth.uid()
      and p.active = true
  );
$$;

revoke all on function private.is_assigned_work_partner(uuid, uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_assigned_work_partner(uuid, uuid) to authenticated;

create table public.lot_logic_intelligence_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_type text not null check (source_type in ('capabilities_document','sop','policy','manager_note','reference_document','import','other')),
  title text not null,
  version_label text,
  source_uri text,
  extracted_text text,
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lot_logic_intelligence_assertions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  knowledge_source_id uuid references public.lot_logic_intelligence_knowledge_sources(id) on delete set null,
  assertion_type text not null check (assertion_type in ('capability','preference','policy','cost_pattern','duration_pattern','partner_pattern','vehicle_pattern','process_pattern','issue_pattern','other')),
  subject_type text not null,
  subject_key text not null,
  predicate text not null,
  value jsonb not null default '{}'::jsonb,
  provenance_type text not null check (provenance_type in ('explicit','observed','calculated','inferred','manager_validated')),
  status text not null default 'active' check (status in ('active','pending_validation','validated','refuted','superseded','archived')),
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  sample_size integer not null default 0 check (sample_size >= 0),
  supporting_count integer not null default 0 check (supporting_count >= 0),
  contradicting_count integer not null default 0 check (contradicting_count >= 0),
  first_observed_at timestamptz,
  last_observed_at timestamptz,
  requires_validation boolean not null default false,
  evidence jsonb not null default '[]'::jsonb,
  validated_by uuid references auth.users(id) on delete set null,
  validated_at timestamptz,
  refuted_by uuid references auth.users(id) on delete set null,
  refuted_at timestamptz,
  superseded_by_assertion_id uuid references public.lot_logic_intelligence_assertions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lot_logic_intelligence_assertions_lookup_idx
  on public.lot_logic_intelligence_assertions(company_id, assertion_type, subject_type, subject_key, status);

create table public.lot_logic_intelligence_prediction_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  evaluation_id uuid references public.auction_evaluations(id) on delete set null,
  vehicle_id uuid references public.mindful_inventory_vehicles(id) on delete set null,
  finding_id uuid references public.mindful_inventory_findings(id) on delete set null,
  plan_item_id uuid references public.mindful_inventory_plan_items(id) on delete set null,
  work_order_id uuid references public.mindful_inventory_work_orders(id) on delete set null,
  prediction_type text not null check (prediction_type in ('finding','work_cost','work_duration','partner','related_issue','ready_date','recon_total','bid','other')),
  subject_key text not null,
  predicted_cost_low numeric,
  predicted_cost_high numeric,
  predicted_labor_minutes integer,
  predicted_elapsed_minutes integer,
  predicted_partner_id uuid references public.mindful_inventory_partners(id) on delete set null,
  predicted_value jsonb not null default '{}'::jsonb,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  model_provider text,
  model_name text,
  prompt_version text,
  context_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index lot_logic_prediction_context_idx
  on public.lot_logic_intelligence_prediction_snapshots(company_id, prediction_type, subject_key, created_at desc);

create table public.lot_logic_partner_blind_estimates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  work_order_id uuid not null references public.mindful_inventory_work_orders(id) on delete cascade,
  partner_id uuid not null references public.mindful_inventory_partners(id) on delete cascade,
  revision_no integer not null default 1 check (revision_no > 0),
  supersedes_estimate_id uuid references public.lot_logic_partner_blind_estimates(id) on delete set null,
  quoted_cost numeric check (quoted_cost is null or quoted_cost >= 0),
  estimated_labor_minutes integer check (estimated_labor_minutes is null or estimated_labor_minutes >= 0),
  estimated_elapsed_minutes integer check (estimated_elapsed_minutes is null or estimated_elapsed_minutes >= 0),
  notes text,
  submitted_by_user_id uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(work_order_id, partner_id, revision_no)
);

create index lot_logic_partner_blind_estimates_work_idx
  on public.lot_logic_partner_blind_estimates(work_order_id, partner_id, submitted_at desc);

create table public.lot_logic_intelligence_prediction_outcomes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prediction_snapshot_id uuid not null references public.lot_logic_intelligence_prediction_snapshots(id) on delete cascade,
  partner_estimate_id uuid references public.lot_logic_partner_blind_estimates(id) on delete set null,
  actual_partner_id uuid references public.mindful_inventory_partners(id) on delete set null,
  actual_cost numeric,
  actual_labor_minutes integer,
  actual_elapsed_minutes integer,
  qc_passed boolean,
  outcome_value jsonb not null default '{}'::jsonb,
  variance jsonb not null default '{}'::jsonb,
  resolved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(prediction_snapshot_id)
);

create table public.lot_logic_intelligence_decision_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  evaluation_id uuid references public.auction_evaluations(id) on delete set null,
  vehicle_id uuid references public.mindful_inventory_vehicles(id) on delete set null,
  work_order_id uuid references public.mindful_inventory_work_orders(id) on delete set null,
  plan_item_id uuid references public.mindful_inventory_plan_items(id) on delete set null,
  decision_type text not null check (decision_type in ('partner_assignment','plan_item_acceptance','plan_item_decline','cost_override','duration_override','bid_override','priority_override','vehicle_exit','upgrade_decision','policy_validation','insight_validation','other')),
  ai_recommendation jsonb not null default '{}'::jsonb,
  human_decision jsonb not null default '{}'::jsonb,
  human_reason text,
  eventual_outcome jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  decided_at timestamptz not null default now(),
  outcome_recorded_at timestamptz,
  created_at timestamptz not null default now()
);

create index lot_logic_decision_events_lookup_idx
  on public.lot_logic_intelligence_decision_events(company_id, decision_type, decided_at desc);

create table public.lot_logic_intelligence_issue_relations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  primary_issue_key text not null,
  related_issue_key text not null,
  relation_type text not null check (relation_type in ('co_occurrence','conditional_follow_on','repair_related','vehicle_pattern','alternate_cause')),
  vehicle_scope jsonb not null default '{}'::jsonb,
  occurrence_count integer not null default 0 check (occurrence_count >= 0),
  opportunity_count integer not null default 0 check (opportunity_count >= 0),
  conditional_probability numeric(5,4) check (conditional_probability is null or (conditional_probability >= 0 and conditional_probability <= 1)),
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  first_observed_at timestamptz,
  last_observed_at timestamptz,
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, primary_issue_key, related_issue_key, relation_type)
);

create table public.lot_logic_intelligence_insights (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  insight_type text not null check (insight_type in ('capability_shift','partner_preference','cost_pattern','duration_pattern','issue_relationship','process_pattern','policy_candidate','estimate_bias','other')),
  title text not null,
  summary text not null,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  sample_size integer not null default 0 check (sample_size >= 0),
  evidence jsonb not null default '[]'::jsonb,
  suggested_action jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','validated','refuted','keep_observing','superseded','archived')),
  surfaced_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  resulting_assertion_id uuid references public.lot_logic_intelligence_assertions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lot_logic_insights_queue_idx
  on public.lot_logic_intelligence_insights(company_id, status, confidence desc, surfaced_at desc);

alter table public.lot_logic_intelligence_knowledge_sources enable row level security;
alter table public.lot_logic_intelligence_assertions enable row level security;
alter table public.lot_logic_intelligence_prediction_snapshots enable row level security;
alter table public.lot_logic_partner_blind_estimates enable row level security;
alter table public.lot_logic_intelligence_prediction_outcomes enable row level security;
alter table public.lot_logic_intelligence_decision_events enable row level security;
alter table public.lot_logic_intelligence_issue_relations enable row level security;
alter table public.lot_logic_intelligence_insights enable row level security;

create policy "company members manage intelligence knowledge sources"
  on public.lot_logic_intelligence_knowledge_sources for all to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

create policy "company members manage intelligence assertions"
  on public.lot_logic_intelligence_assertions for all to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

create policy "company members manage intelligence predictions"
  on public.lot_logic_intelligence_prediction_snapshots for all to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

create policy "company members manage partner blind estimates"
  on public.lot_logic_partner_blind_estimates for all to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

create policy "assigned partners view own blind estimates"
  on public.lot_logic_partner_blind_estimates for select to authenticated
  using (private.is_assigned_work_partner(work_order_id, partner_id));

create policy "assigned partners submit blind estimates"
  on public.lot_logic_partner_blind_estimates for insert to authenticated
  with check (
    private.is_assigned_work_partner(work_order_id, partner_id)
    and submitted_by_user_id = auth.uid()
  );

create policy "company members manage intelligence outcomes"
  on public.lot_logic_intelligence_prediction_outcomes for all to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

create policy "company members manage intelligence decisions"
  on public.lot_logic_intelligence_decision_events for all to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

create policy "company members manage intelligence issue relations"
  on public.lot_logic_intelligence_issue_relations for all to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

create policy "company members manage intelligence insights"
  on public.lot_logic_intelligence_insights for all to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

grant select, insert, update, delete on public.lot_logic_intelligence_knowledge_sources to authenticated;
grant select, insert, update, delete on public.lot_logic_intelligence_assertions to authenticated;
grant select, insert, update, delete on public.lot_logic_intelligence_prediction_snapshots to authenticated;
grant select, insert on public.lot_logic_partner_blind_estimates to authenticated;
grant select, insert, update, delete on public.lot_logic_intelligence_prediction_outcomes to authenticated;
grant select, insert, update, delete on public.lot_logic_intelligence_decision_events to authenticated;
grant select, insert, update, delete on public.lot_logic_intelligence_issue_relations to authenticated;
grant select, insert, update, delete on public.lot_logic_intelligence_insights to authenticated;

comment on table public.lot_logic_partner_blind_estimates is 'Partner-entered independent estimates. Internal AI predictions and management budgets must not be exposed to partners before submission.';
comment on table public.lot_logic_intelligence_prediction_snapshots is 'Immutable management-side AI predictions used for prediction-versus-outcome learning.';
comment on table public.lot_logic_intelligence_issue_relations is 'Company-specific learned relationships among findings/issues, including co-occurrence and typical follow-on issues.';
