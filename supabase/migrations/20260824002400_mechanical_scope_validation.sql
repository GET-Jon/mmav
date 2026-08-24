-- Mechanical scope validation foundation.
--
-- Mechanical validates imported Lot Logic findings and owner-requested upgrades
-- before the preliminary Work Plan can move forward. These fields intentionally
-- capture validation state without yet implementing material-change decisions.

alter table public.mindful_inventory_findings
  add column if not exists mechanical_validation_status text not null default 'pending'
    check (mechanical_validation_status in ('pending', 'confirmed', 'not_found', 'changed', 'needs_diagnosis')),
  add column if not exists mechanical_validation_notes text;

alter table public.mindful_inventory_upgrades
  add column if not exists mechanical_validation_status text not null default 'pending'
    check (mechanical_validation_status in ('pending', 'feasible', 'feasible_with_changes', 'not_recommended', 'needs_info')),
  add column if not exists mechanical_validation_notes text;

create index if not exists mindful_inventory_findings_mechanical_validation_idx
  on public.mindful_inventory_findings(vehicle_id, mechanical_validation_status)
  where source = 'ai' and status = 'open';

create index if not exists mindful_inventory_upgrades_mechanical_validation_idx
  on public.mindful_inventory_upgrades(vehicle_id, mechanical_validation_status)
  where status = 'proposed';
