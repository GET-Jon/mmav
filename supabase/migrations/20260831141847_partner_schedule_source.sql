alter table public.mindful_inventory_work_orders
  drop constraint if exists mindful_inventory_work_orders_schedule_source_check;

alter table public.mindful_inventory_work_orders
  add constraint mindful_inventory_work_orders_schedule_source_check
  check (schedule_source = any (array['suggested'::text, 'manual'::text, 'partner'::text]));
