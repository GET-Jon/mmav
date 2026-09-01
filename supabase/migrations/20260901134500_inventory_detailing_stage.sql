alter type public.mindful_inventory_vehicle_phase add value if not exists 'detailing' before 'final_qc';

create table if not exists public.mindful_inventory_detailing (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null unique references public.mindful_inventory_vehicles(id) on delete cascade,
  partner_id uuid references public.mindful_inventory_partners(id) on delete set null,
  detail_level text not null default 'retail' check (detail_level in ('presentation','retail','full','restoration','custom')),
  scope_items text[] not null default '{}',
  custom_scope text,
  status text not null default 'not_ready' check (status in ('not_ready','needs_setup','awaiting_partner','scheduled','in_progress','completed','accepted')),
  proposed_start_at timestamptz,
  scheduled_start_at timestamptz,
  expected_turnaround_minutes integer check (expected_turnaround_minutes is null or expected_turnaround_minutes >= 0),
  partner_confirmation_status text check (partner_confirmation_status is null or partner_confirmation_status in ('awaiting_partner','confirmed','declined')),
  quoted_cost numeric(12,2) check (quoted_cost is null or quoted_cost >= 0),
  actual_cost numeric(12,2) check (actual_cost is null or actual_cost >= 0),
  notes text,
  completed_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mindful_inventory_detailing enable row level security;

drop policy if exists "inventory members manage detailing" on public.mindful_inventory_detailing;
create policy "inventory members manage detailing"
on public.mindful_inventory_detailing
for all
to authenticated
using (exists (
  select 1 from public.mindful_inventory_vehicles vehicle
  where vehicle.id = mindful_inventory_detailing.vehicle_id
    and public.is_company_member(vehicle.company_id)
))
with check (exists (
  select 1 from public.mindful_inventory_vehicles vehicle
  where vehicle.id = mindful_inventory_detailing.vehicle_id
    and public.is_company_member(vehicle.company_id)
));

grant select, insert, update, delete on public.mindful_inventory_detailing to authenticated;
grant all on public.mindful_inventory_detailing to service_role;

create index if not exists mindful_inventory_detailing_partner_idx on public.mindful_inventory_detailing(partner_id);
create index if not exists mindful_inventory_detailing_status_idx on public.mindful_inventory_detailing(status);
