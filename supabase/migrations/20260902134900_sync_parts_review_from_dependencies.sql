create or replace function public.sync_work_order_parts_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_work_order_id uuid;
  has_any boolean;
  has_unresolved boolean;
begin
  target_work_order_id := coalesce(new.work_order_id, old.work_order_id);

  select exists(
    select 1 from public.mindful_inventory_work_order_parts p
    where p.work_order_id = target_work_order_id
  ) into has_any;

  select exists(
    select 1
    from public.mindful_inventory_work_order_parts p
    where p.work_order_id = target_work_order_id
      and p.status <> 'cancelled'
      and p.dependency_resolution is null
  ) into has_unresolved;

  if has_any then
    update public.mindful_inventory_work_orders
    set parts_review_status = case when has_unresolved then 'pending' else 'resolved' end,
        parts_reviewed_at = case when has_unresolved then null else coalesce(parts_reviewed_at, now()) end,
        updated_at = now()
    where id = target_work_order_id;
  elsif tg_op = 'INSERT' then
    update public.mindful_inventory_work_orders
    set parts_review_status = 'pending',
        parts_reviewed_at = null,
        parts_reviewed_by_user_id = null,
        updated_at = now()
    where id = target_work_order_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists mindful_work_order_parts_review_sync on public.mindful_inventory_work_order_parts;
create trigger mindful_work_order_parts_review_sync
after insert or update of status, dependency_resolution or delete
on public.mindful_inventory_work_order_parts
for each row execute function public.sync_work_order_parts_review();