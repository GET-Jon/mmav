alter table public.mindful_inventory_findings
  drop constraint if exists mindful_inventory_findings_mechanical_owner_review_status_check;

alter table public.mindful_inventory_findings
  add constraint mindful_inventory_findings_mechanical_owner_review_status_check
  check (
    mechanical_owner_review_status is null
    or mechanical_owner_review_status in ('accepted', 'dismissed', 'clarification_requested')
  );

alter table public.mindful_inventory_upgrades
  add column if not exists mechanical_recommended_action text,
  add column if not exists mechanical_can_perform boolean,
  add column if not exists mechanical_labor_hours numeric,
  add column if not exists mechanical_proposed_labor_price numeric,
  add column if not exists mechanical_suggested_parts jsonb not null default '[]'::jsonb;

alter table public.mindful_inventory_upgrades
  drop constraint if exists mindful_inventory_upgrades_mechanical_labor_hours_check;
alter table public.mindful_inventory_upgrades
  add constraint mindful_inventory_upgrades_mechanical_labor_hours_check
  check (mechanical_labor_hours is null or mechanical_labor_hours >= 0);

alter table public.mindful_inventory_upgrades
  drop constraint if exists mindful_inventory_upgrades_mechanical_proposed_labor_price_check;
alter table public.mindful_inventory_upgrades
  add constraint mindful_inventory_upgrades_mechanical_proposed_labor_price_check
  check (mechanical_proposed_labor_price is null or mechanical_proposed_labor_price >= 0);

grant select, update on table public.mindful_inventory_upgrades to service_role;

notify pgrst, 'reload schema';
