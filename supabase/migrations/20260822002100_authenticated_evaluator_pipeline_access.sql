-- Let signed-in company members use the Evaluator -> Pipeline -> Inventory flow
-- through their authenticated session and tenant RLS rather than requiring
-- the application service-role client for ordinary user operations.

grant select, insert, update on table public.auction_evaluations to authenticated;

alter table public.auction_evaluations enable row level security;

drop policy if exists "company members can view auction evaluations" on public.auction_evaluations;
create policy "company members can view auction evaluations"
on public.auction_evaluations
for select
to authenticated
using (public.is_company_member(company_id));

drop policy if exists "company members can create auction evaluations" on public.auction_evaluations;
create policy "company members can create auction evaluations"
on public.auction_evaluations
for insert
to authenticated
with check (
  public.is_company_member(company_id)
  and (created_by is null or created_by = auth.uid())
  and (updated_by is null or updated_by = auth.uid())
);

drop policy if exists "company members can update auction evaluations" on public.auction_evaluations;
create policy "company members can update auction evaluations"
on public.auction_evaluations
for update
to authenticated
using (public.is_company_member(company_id))
with check (
  public.is_company_member(company_id)
  and (updated_by is null or updated_by = auth.uid())
);

-- The purchase function already validates both the requested tenant and the
-- requesting user's active membership before it writes anything.
grant execute on function public.purchase_evaluation_and_add_to_inventory(uuid, uuid, uuid) to authenticated;
