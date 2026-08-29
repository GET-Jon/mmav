create or replace function private.is_company_admin_actor(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_memberships cm
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.role = 'company_admin'
  ) or exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
  );
$$;

revoke all on function private.is_company_admin_actor(uuid) from public;
grant execute on function private.is_company_admin_actor(uuid) to authenticated;

drop policy if exists "company members manage intelligence knowledge sources" on public.lot_logic_intelligence_knowledge_sources;
drop policy if exists "company members manage intelligence assertions" on public.lot_logic_intelligence_assertions;
drop policy if exists "company members manage intelligence predictions" on public.lot_logic_intelligence_prediction_snapshots;
drop policy if exists "company members manage partner blind estimates" on public.lot_logic_partner_blind_estimates;
drop policy if exists "assigned partners view own blind estimates" on public.lot_logic_partner_blind_estimates;
drop policy if exists "assigned partners submit blind estimates" on public.lot_logic_partner_blind_estimates;
drop policy if exists "company members manage intelligence outcomes" on public.lot_logic_intelligence_prediction_outcomes;
drop policy if exists "company members manage intelligence decisions" on public.lot_logic_intelligence_decision_events;
drop policy if exists "company members manage intelligence issue relations" on public.lot_logic_intelligence_issue_relations;
drop policy if exists "company members manage intelligence insights" on public.lot_logic_intelligence_insights;

create policy "company members view intelligence knowledge sources"
  on public.lot_logic_intelligence_knowledge_sources for select to authenticated
  using (public.is_company_member(company_id));
create policy "company admins manage intelligence knowledge sources"
  on public.lot_logic_intelligence_knowledge_sources for all to authenticated
  using (private.is_company_admin_actor(company_id))
  with check (private.is_company_admin_actor(company_id));

create policy "company members view intelligence assertions"
  on public.lot_logic_intelligence_assertions for select to authenticated
  using (public.is_company_member(company_id));
create policy "company admins manage intelligence assertions"
  on public.lot_logic_intelligence_assertions for all to authenticated
  using (private.is_company_admin_actor(company_id))
  with check (private.is_company_admin_actor(company_id));

create policy "company members view intelligence predictions"
  on public.lot_logic_intelligence_prediction_snapshots for select to authenticated
  using (public.is_company_member(company_id));
create policy "company members create intelligence predictions"
  on public.lot_logic_intelligence_prediction_snapshots for insert to authenticated
  with check (public.is_company_member(company_id));

create policy "authorized users access blind estimates"
  on public.lot_logic_partner_blind_estimates for select to authenticated
  using (
    public.is_company_member(company_id)
    or private.is_assigned_work_partner(work_order_id, partner_id)
  );
create policy "authorized users submit blind estimates"
  on public.lot_logic_partner_blind_estimates for insert to authenticated
  with check (
    public.is_company_member(company_id)
    or (
      private.is_assigned_work_partner(work_order_id, partner_id)
      and submitted_by_user_id = auth.uid()
    )
  );

create policy "company members view intelligence outcomes"
  on public.lot_logic_intelligence_prediction_outcomes for select to authenticated
  using (public.is_company_member(company_id));
create policy "company members create intelligence outcomes"
  on public.lot_logic_intelligence_prediction_outcomes for insert to authenticated
  with check (public.is_company_member(company_id));
create policy "company members update intelligence outcomes"
  on public.lot_logic_intelligence_prediction_outcomes for update to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

create policy "company members view intelligence decisions"
  on public.lot_logic_intelligence_decision_events for select to authenticated
  using (public.is_company_member(company_id));
create policy "company members create intelligence decisions"
  on public.lot_logic_intelligence_decision_events for insert to authenticated
  with check (public.is_company_member(company_id));
create policy "company members update intelligence decision outcomes"
  on public.lot_logic_intelligence_decision_events for update to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

create policy "company members view intelligence issue relations"
  on public.lot_logic_intelligence_issue_relations for select to authenticated
  using (public.is_company_member(company_id));
create policy "company admins manage intelligence issue relations"
  on public.lot_logic_intelligence_issue_relations for all to authenticated
  using (private.is_company_admin_actor(company_id))
  with check (private.is_company_admin_actor(company_id));

create policy "company members view intelligence insights"
  on public.lot_logic_intelligence_insights for select to authenticated
  using (public.is_company_member(company_id));
create policy "company admins manage intelligence insights"
  on public.lot_logic_intelligence_insights for all to authenticated
  using (private.is_company_admin_actor(company_id))
  with check (private.is_company_admin_actor(company_id));

revoke all on public.lot_logic_intelligence_knowledge_sources from authenticated;
grant select, insert, update, delete on public.lot_logic_intelligence_knowledge_sources to authenticated;
revoke all on public.lot_logic_intelligence_assertions from authenticated;
grant select, insert, update, delete on public.lot_logic_intelligence_assertions to authenticated;
revoke all on public.lot_logic_intelligence_prediction_snapshots from authenticated;
grant select, insert on public.lot_logic_intelligence_prediction_snapshots to authenticated;
revoke all on public.lot_logic_partner_blind_estimates from authenticated;
grant select, insert on public.lot_logic_partner_blind_estimates to authenticated;
revoke all on public.lot_logic_intelligence_prediction_outcomes from authenticated;
grant select, insert, update on public.lot_logic_intelligence_prediction_outcomes to authenticated;
revoke all on public.lot_logic_intelligence_decision_events from authenticated;
grant select, insert, update on public.lot_logic_intelligence_decision_events to authenticated;
revoke all on public.lot_logic_intelligence_issue_relations from authenticated;
grant select, insert, update, delete on public.lot_logic_intelligence_issue_relations to authenticated;
revoke all on public.lot_logic_intelligence_insights from authenticated;
grant select, insert, update, delete on public.lot_logic_intelligence_insights to authenticated;

create index if not exists lot_logic_knowledge_sources_company_idx
  on public.lot_logic_intelligence_knowledge_sources(company_id, active, created_at desc);
create index if not exists lot_logic_predictions_work_order_idx
  on public.lot_logic_intelligence_prediction_snapshots(work_order_id) where work_order_id is not null;
create index if not exists lot_logic_predictions_plan_item_idx
  on public.lot_logic_intelligence_prediction_snapshots(plan_item_id) where plan_item_id is not null;
create index if not exists lot_logic_predictions_vehicle_idx
  on public.lot_logic_intelligence_prediction_snapshots(vehicle_id) where vehicle_id is not null;
create index if not exists lot_logic_outcomes_company_idx
  on public.lot_logic_intelligence_prediction_outcomes(company_id, resolved_at desc);
create index if not exists lot_logic_decisions_work_order_idx
  on public.lot_logic_intelligence_decision_events(work_order_id) where work_order_id is not null;
create index if not exists lot_logic_issue_relations_company_idx
  on public.lot_logic_intelligence_issue_relations(company_id, primary_issue_key, relation_type);
