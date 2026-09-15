-- Restore the service-role CRUD privileges required by Partner Profile location management.
-- Partner profile APIs use the server-side service-role client after authenticating
-- and scoping the requesting Partner in application code.

grant select, insert, update, delete
on table public.mindful_inventory_locations
to service_role;

grant select, insert, update, delete
on table public.mindful_inventory_partner_locations
to service_role;
