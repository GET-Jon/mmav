alter table public.mindful_inventory_work_orders
  add column if not exists proposed_start_at timestamptz,
  add column if not exists proposed_end_at timestamptz,
  add column if not exists partner_confirmation_status text;

alter table public.mindful_inventory_work_orders
  drop constraint if exists mindful_inventory_work_orders_partner_confirmation_status_check;

alter table public.mindful_inventory_work_orders
  add constraint mindful_inventory_work_orders_partner_confirmation_status_check
  check (partner_confirmation_status is null or partner_confirmation_status in ('awaiting_partner','confirmed','declined'));

create index if not exists mindful_inventory_work_orders_proposed_start_idx
  on public.mindful_inventory_work_orders(proposed_start_at)
  where proposed_start_at is not null;
