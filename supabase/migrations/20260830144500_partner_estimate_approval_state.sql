alter table public.mindful_inventory_work_orders
  add column if not exists partner_estimate_status text,
  add column if not exists approved_partner_estimate_id uuid,
  add column if not exists partner_estimate_reviewed_at timestamptz,
  add column if not exists partner_estimate_reviewed_by uuid;

alter table public.mindful_inventory_work_orders
  drop constraint if exists mindful_inventory_work_orders_partner_estimate_status_check;

alter table public.mindful_inventory_work_orders
  add constraint mindful_inventory_work_orders_partner_estimate_status_check
  check (partner_estimate_status is null or partner_estimate_status in ('awaiting_estimate','awaiting_review','approved','revision_requested','not_required'));

alter table public.mindful_inventory_work_orders
  drop constraint if exists mindful_inventory_work_orders_approved_partner_estimate_id_fkey;

alter table public.mindful_inventory_work_orders
  add constraint mindful_inventory_work_orders_approved_partner_estimate_id_fkey
  foreign key (approved_partner_estimate_id) references public.lot_logic_partner_blind_estimates(id) on delete set null;

alter table public.mindful_inventory_work_orders
  drop constraint if exists mindful_inventory_work_orders_partner_estimate_reviewed_by_fkey;

alter table public.mindful_inventory_work_orders
  add constraint mindful_inventory_work_orders_partner_estimate_reviewed_by_fkey
  foreign key (partner_estimate_reviewed_by) references auth.users(id) on delete set null;

update public.mindful_inventory_work_orders wo
set partner_estimate_status = case
  when perm.edit_estimate is true then 'awaiting_estimate'
  else 'not_required'
end
from public.mindful_inventory_partners p
left join public.mindful_inventory_partner_permissions perm on perm.partner_id = p.id
where wo.assigned_partner_id = p.id
  and wo.partner_estimate_status is null;

comment on column public.mindful_inventory_work_orders.partner_estimate_status is
  'Partner-facing commercial gate. Internal approved_budget remains hidden; partner work cannot begin until status is approved or not_required.';
