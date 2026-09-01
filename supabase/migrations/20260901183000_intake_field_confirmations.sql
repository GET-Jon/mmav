alter table public.mindful_inventory_intakes
  add column if not exists field_confirmations jsonb not null default '{}'::jsonb;

comment on column public.mindful_inventory_intakes.field_confirmations is
  'Per-field Intake confirmation ledger. Keys map to confirmed value/timestamp metadata for guided intake verification.';
