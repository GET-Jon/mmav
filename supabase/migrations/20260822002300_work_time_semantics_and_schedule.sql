-- Lot Logic Inventory — distinguish hands-on labor from elapsed turnaround time.
-- Scheduling uses elapsed time; labor/capacity uses hands-on time.

alter table public.mindful_inventory_plan_items
  add column if not exists estimated_labor_hours numeric(8,2)
    check (estimated_labor_hours is null or estimated_labor_hours >= 0),
  add column if not exists estimated_elapsed_hours numeric(8,2)
    check (estimated_elapsed_hours is null or estimated_elapsed_hours >= 0);

alter table public.mindful_inventory_work_orders
  add column if not exists estimated_labor_minutes integer
    check (estimated_labor_minutes is null or estimated_labor_minutes >= 0),
  add column if not exists estimated_elapsed_minutes integer
    check (estimated_elapsed_minutes is null or estimated_elapsed_minutes >= 0);

-- Keep the legacy duration fields intact for history. New code writes explicit
-- labor + elapsed values and mirrors elapsed into estimated_duration_minutes.
comment on column public.mindful_inventory_plan_items.estimated_duration_hours is
  'Legacy ambiguous AI duration. New work plans use estimated_labor_hours and estimated_elapsed_hours.';
comment on column public.mindful_inventory_plan_items.estimated_labor_hours is
  'Estimated hands-on technician/vendor labor hours.';
comment on column public.mindful_inventory_plan_items.estimated_elapsed_hours is
  'Estimated calendar/turnaround hours from task start to task-ready completion, including non-labor wait/cure/diagnostic time.';
comment on column public.mindful_inventory_work_orders.estimated_labor_minutes is
  'Estimated hands-on labor minutes used for capacity planning.';
comment on column public.mindful_inventory_work_orders.estimated_elapsed_minutes is
  'Estimated elapsed calendar minutes used for scheduling.';
