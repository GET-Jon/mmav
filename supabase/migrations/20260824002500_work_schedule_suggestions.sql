-- Active Work scheduling provenance and performer ownership.
-- Suggested schedules are created when a Work Plan is activated, then can be
-- moved manually without losing whether the current slot came from the engine.

alter table public.mindful_inventory_work_orders
  add column if not exists assigned_user_id uuid references auth.users(id) on delete set null,
  add column if not exists schedule_source text check (schedule_source in ('suggested', 'manual'));

create index if not exists mindful_inventory_work_orders_assigned_user_status_idx
  on public.mindful_inventory_work_orders(assigned_user_id, status)
  where assigned_user_id is not null;

comment on column public.mindful_inventory_work_orders.assigned_user_id is
  'Internal person actually performing the Work Order. Distinct from Vehicle Owner/accountability.';
comment on column public.mindful_inventory_work_orders.schedule_source is
  'Whether the current scheduled slot was suggested automatically or manually placed/edited.';
