alter table public.mindful_inventory_work_order_parts
  add column if not exists dependency_resolution text,
  add column if not exists dependency_resolved_at timestamptz,
  add column if not exists dependency_resolved_by uuid;

alter table public.mindful_inventory_work_order_parts
  drop constraint if exists mindful_inventory_work_order_parts_dependency_resolution_check;

alter table public.mindful_inventory_work_order_parts
  add constraint mindful_inventory_work_order_parts_dependency_resolution_check
  check (dependency_resolution is null or dependency_resolution in ('in_stock','purchased','partner_supplied','customer_supplied','not_required'));

comment on column public.mindful_inventory_work_order_parts.dependency_resolution is
  'How a required Work Order dependency was resolved, separate from the part logistics lifecycle status.';
