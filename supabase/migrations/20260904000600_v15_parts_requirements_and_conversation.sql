-- V15 Parts redesign: separate suggested/required parts from procurement execution.
-- This preserves the mechanic/owner sourcing conversation before a part is ordered.

alter table public.mindful_inventory_work_order_parts
  add column if not exists requirement_id uuid null;

create table if not exists public.mindful_inventory_part_requirements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  vehicle_id uuid not null references public.mindful_inventory_vehicles(id) on delete cascade,
  plan_item_id uuid null references public.mindful_inventory_plan_items(id) on delete cascade,
  work_order_id uuid null references public.mindful_inventory_work_orders(id) on delete cascade,
  finding_id uuid null references public.mindful_inventory_findings(id) on delete set null,
  upgrade_id uuid null references public.mindful_inventory_upgrades(id) on delete set null,
  linked_part_id uuid null references public.mindful_inventory_work_order_parts(id) on delete set null,
  description text not null,
  quantity numeric not null default 1 check (quantity > 0),
  part_number text null,
  origin text not null default 'mechanic' check (origin in ('ai','mechanic','owner','manager','work_order')),
  requirement_status text not null default 'suggested' check (requirement_status in ('suggested','required','not_required')),
  suggested_by_partner_id uuid null references public.mindful_inventory_partners(id) on delete set null,
  suggested_by_user_id uuid null references auth.users(id) on delete set null,
  partner_offer_unit_price numeric null check (partner_offer_unit_price is null or partner_offer_unit_price >= 0),
  partner_offer_note text null,
  fitment_query text null,
  fulfillment_method text null check (fulfillment_method is null or fulfillment_method in ('mindful_purchase','partner_supplied','in_stock','customer_supplied','not_required')),
  sourcing_owner text null check (sourcing_owner is null or sourcing_owner in ('owner','partner')),
  blocking boolean not null default true,
  owner_target_unit_price_low numeric null check (owner_target_unit_price_low is null or owner_target_unit_price_low >= 0),
  owner_target_unit_price_high numeric null check (owner_target_unit_price_high is null or owner_target_unit_price_high >= 0),
  owner_decision_note text null,
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (owner_target_unit_price_low is null or owner_target_unit_price_high is null or owner_target_unit_price_high >= owner_target_unit_price_low)
);

create table if not exists public.mindful_inventory_part_requirement_messages (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.mindful_inventory_part_requirements(id) on delete cascade,
  actor_type text not null check (actor_type in ('owner','partner','system')),
  actor_user_id uuid null references auth.users(id) on delete set null,
  actor_partner_id uuid null references public.mindful_inventory_partners(id) on delete set null,
  message_type text not null default 'note' check (message_type in ('note','offer','counter','decision','source')),
  body text not null,
  unit_price numeric null check (unit_price is null or unit_price >= 0),
  source_url text null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_inventory_work_order_parts_requirement_unique
  on public.mindful_inventory_work_order_parts(requirement_id)
  where requirement_id is not null;
create index if not exists idx_inventory_part_requirements_vehicle
  on public.mindful_inventory_part_requirements(vehicle_id, requirement_status, created_at);
create index if not exists idx_inventory_part_requirements_plan_item
  on public.mindful_inventory_part_requirements(plan_item_id);
create index if not exists idx_inventory_part_requirements_work_order
  on public.mindful_inventory_part_requirements(work_order_id);
create index if not exists idx_inventory_part_requirement_messages_requirement
  on public.mindful_inventory_part_requirement_messages(requirement_id, created_at);

alter table public.mindful_inventory_work_order_parts
  drop constraint if exists mindful_inventory_work_order_parts_requirement_id_fkey;
alter table public.mindful_inventory_work_order_parts
  add constraint mindful_inventory_work_order_parts_requirement_id_fkey
  foreign key (requirement_id) references public.mindful_inventory_part_requirements(id) on delete set null;

grant select, insert, update, delete on public.mindful_inventory_part_requirements to authenticated;
grant select, insert on public.mindful_inventory_part_requirement_messages to authenticated;

alter table public.mindful_inventory_part_requirements enable row level security;
alter table public.mindful_inventory_part_requirement_messages enable row level security;

create policy "inventory members manage part requirements"
on public.mindful_inventory_part_requirements
for all
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

create policy "inventory members view part requirement messages"
on public.mindful_inventory_part_requirement_messages
for select
using (
  exists (
    select 1 from public.mindful_inventory_part_requirements requirement
    where requirement.id = requirement_id
      and public.is_company_member(requirement.company_id)
  )
);

create policy "inventory members append part requirement messages"
on public.mindful_inventory_part_requirement_messages
for insert
with check (
  exists (
    select 1 from public.mindful_inventory_part_requirements requirement
    where requirement.id = requirement_id
      and public.is_company_member(requirement.company_id)
  )
);
