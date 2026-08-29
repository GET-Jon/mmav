alter table public.mindful_inventory_partners
  add column if not exists location_text text,
  add column if not exists portal_invited_at timestamptz,
  add column if not exists portal_invited_email text,
  add column if not exists portal_profile_confirmed_at timestamptz,
  add column if not exists portal_access_enabled boolean not null default false;

grant select, update on public.mindful_inventory_partners to service_role;
grant select on public.mindful_inventory_partner_permissions to service_role;
grant select on public.mindful_inventory_partner_capabilities to service_role;
grant select, insert, delete on public.mindful_inventory_partner_capability_assignments to service_role;
grant select on public.mindful_inventory_work_orders to service_role;
grant select on public.mindful_inventory_vehicles to service_role;
grant select on public.mindful_inventory_locations to service_role;
