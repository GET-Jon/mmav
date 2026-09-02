alter table public.mindful_inventory_findings
  add column if not exists mechanical_recommended_action text,
  add column if not exists mechanical_parts_required text,
  add column if not exists mechanical_can_perform boolean,
  add column if not exists mechanical_labor_hours numeric(8,2);
