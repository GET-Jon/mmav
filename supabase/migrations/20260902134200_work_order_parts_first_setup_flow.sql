alter table public.mindful_inventory_work_orders
  add column if not exists parts_review_status text not null default 'pending',
  add column if not exists parts_reviewed_at timestamptz,
  add column if not exists parts_reviewed_by_user_id uuid references auth.users(id) on delete set null;

alter table public.mindful_inventory_work_orders
  drop constraint if exists mindful_inventory_work_orders_parts_review_status_check;

alter table public.mindful_inventory_work_orders
  add constraint mindful_inventory_work_orders_parts_review_status_check
  check (parts_review_status = any (array['pending'::text,'resolved'::text]));

update public.mindful_inventory_work_orders wo
set parts_review_status = 'resolved',
    parts_reviewed_at = coalesce(parts_reviewed_at, now())
where exists (
  select 1 from public.mindful_inventory_work_order_parts p where p.work_order_id = wo.id
)
and not exists (
  select 1
  from public.mindful_inventory_work_order_parts p
  where p.work_order_id = wo.id
    and p.status <> 'cancelled'
    and p.dependency_resolution is null
);

update public.mindful_inventory_work_orders wo
set scheduled_start_at = null,
    scheduled_end_at = null,
    proposed_start_at = null,
    proposed_end_at = null,
    partner_confirmation_status = case when assigned_partner_id is not null then null else partner_confirmation_status end,
    schedule_source = null,
    status = case when status = 'scheduled' then 'ready_to_schedule'::mindful_inventory_work_order_status else status end,
    updated_at = now()
where status in ('planned','ready_to_schedule','scheduled')
  and (
    parts_review_status <> 'resolved'
    or exists (
      select 1 from public.mindful_inventory_work_order_parts p
      where p.work_order_id = wo.id and p.status not in ('received','installed','cancelled')
    )
  );