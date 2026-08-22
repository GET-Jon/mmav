-- Ensure server-side Supabase service-role clients can use the shared
-- Evaluator -> Pipeline -> Inventory data path in local/dev resets.
-- RLS remains relevant to signed-in browser clients; service_role is used only
-- by trusted server-side application code.

grant usage on schema public to service_role;

grant select on table public.companies to service_role;
grant select on table public.company_memberships to service_role;

do $$
begin
  if to_regclass('public.auction_evaluations') is not null then
    execute 'grant select, insert, update, delete on table public.auction_evaluations to service_role';
  end if;
end;
$$;
