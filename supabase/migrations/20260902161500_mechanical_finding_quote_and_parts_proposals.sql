alter table public.mindful_inventory_findings
  add column if not exists mechanical_proposed_labor_price numeric,
  add column if not exists mechanical_part_suggestions jsonb not null default '[]'::jsonb;

alter table public.mindful_inventory_findings
  drop constraint if exists mindful_inventory_findings_mechanical_proposed_labor_price_check;

alter table public.mindful_inventory_findings
  add constraint mindful_inventory_findings_mechanical_proposed_labor_price_check
  check (mechanical_proposed_labor_price is null or mechanical_proposed_labor_price >= 0);

comment on column public.mindful_inventory_findings.mechanical_proposed_labor_price is
  'Independent labor price proposed by the inspecting mechanic; separate from Mindful internal estimates.';
comment on column public.mindful_inventory_findings.mechanical_part_suggestions is
  'Structured mechanic-proposed parts retained on the finding until Owner review/work-plan creation.';
