alter table public.mindful_inventory_work_orders
  add column if not exists partner_location_confirmation_status text,
  add column if not exists partner_location_request text,
  add column if not exists partner_parts_confirmation_status text,
  add column if not exists partner_parts_note text;

comment on column public.mindful_inventory_work_orders.partner_location_confirmation_status is 'Partner acknowledgement state for assigned work location.';
comment on column public.mindful_inventory_work_orders.partner_location_request is 'Partner-requested location change or logistics note; does not directly change assigned location.';
comment on column public.mindful_inventory_work_orders.partner_parts_confirmation_status is 'Partner acknowledgement state for Work Order parts readiness/details.';
comment on column public.mindful_inventory_work_orders.partner_parts_note is 'Partner-reported parts mismatch or issue; does not directly edit procurement records.';
