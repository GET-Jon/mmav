alter table public.mindful_inventory_work_orders
  add column if not exists partner_completion_notes text null;
