alter table public.mindful_inventory_work_order_parts
  add column if not exists source_type text,
  add column if not exists source_url text,
  add column if not exists part_number text,
  add column if not exists shipping_cost numeric,
  add column if not exists tracking_reference text,
  add column if not exists installed_at timestamptz;

alter table public.mindful_inventory_work_order_parts
  drop constraint if exists mindful_inventory_work_order_parts_source_type_check;

alter table public.mindful_inventory_work_order_parts
  add constraint mindful_inventory_work_order_parts_source_type_check
  check (source_type is null or source_type in ('official_retailer','parts_retailer','marketplace','local_supplier','other'));

alter table public.mindful_inventory_work_order_parts
  drop constraint if exists mindful_inventory_work_order_parts_status_check;

alter table public.mindful_inventory_work_order_parts
  add constraint mindful_inventory_work_order_parts_status_check
  check (status in ('needed','ordered','backordered','received','installed','cancelled'));

alter table public.mindful_inventory_work_order_parts
  drop constraint if exists mindful_inventory_work_order_parts_shipping_cost_check;

alter table public.mindful_inventory_work_order_parts
  add constraint mindful_inventory_work_order_parts_shipping_cost_check
  check (shipping_cost is null or shipping_cost >= 0);
