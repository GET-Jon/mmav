alter table public.mindful_inventory_work_orders
  drop constraint if exists mindful_inventory_work_orders_partner_confirmation_status_check;

alter table public.mindful_inventory_work_orders
  add constraint mindful_inventory_work_orders_partner_confirmation_status_check
  check (
    partner_confirmation_status is null
    or partner_confirmation_status = any (
      array[
        'awaiting_partner'::text,
        'awaiting_owner'::text,
        'confirmed'::text,
        'declined'::text
      ]
    )
  );
