-- Ensure authenticated users can reach tenant lookup tables before RLS evaluates row access.
-- RLS policies still restrict rows to active company memberships.

grant select on table public.companies to authenticated;
grant select on table public.company_memberships to authenticated;
