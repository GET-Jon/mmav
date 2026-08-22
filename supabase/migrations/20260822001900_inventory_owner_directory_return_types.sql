-- Fix strict PostgreSQL RETURNS TABLE type matching for the Inventory owner
-- directory. auth.users.email and membership.role may be varchar/enum-like in
-- different environments; cast them explicitly to the function's text result
-- contract.

create or replace function public.get_inventory_company_members(
  requested_company_id uuid
)
returns table (
  user_id uuid,
  display_name text,
  email text,
  role text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_company_member(requested_company_id, auth.uid()) then
    raise exception 'Company membership required.';
  end if;

  return query
  select
    membership.user_id::uuid,
    coalesce(
      nullif(trim(users.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(users.raw_user_meta_data ->> 'name'), ''),
      users.email::text,
      membership.user_id::text
    )::text as display_name,
    users.email::text as email,
    membership.role::text as role
  from public.company_memberships membership
  join auth.users users on users.id = membership.user_id
  where membership.company_id = requested_company_id
    and membership.status = 'active'
  order by
    coalesce(
      nullif(trim(users.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(users.raw_user_meta_data ->> 'name'), ''),
      users.email::text,
      membership.user_id::text
    );
end;
$$;

revoke all on function public.get_inventory_company_members(uuid) from public;
grant execute on function public.get_inventory_company_members(uuid) to authenticated;
