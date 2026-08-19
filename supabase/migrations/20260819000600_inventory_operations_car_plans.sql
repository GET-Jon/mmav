-- Lot Logic Inventory Operations — Car Plan architecture.
-- The Car Plan defines intent. Approved plan versions are immutable historical records.

create table public.mindful_inventory_car_plans (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.mindful_inventory_vehicles(id) on delete cascade,
  current_approved_version_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index mindful_inventory_car_plans_vehicle_unique_idx
  on public.mindful_inventory_car_plans(vehicle_id);

create table public.mindful_inventory_car_plan_versions (
  id uuid primary key default gen_random_uuid(),
  car_plan_id uuid not null references public.mindful_inventory_car_plans(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status public.mindful_inventory_plan_status not null default 'draft',
  parent_version_id uuid references public.mindful_inventory_car_plan_versions(id) on delete restrict,
  revision_reason text,
  planning_total numeric(12,2) not null default 0 check (planning_total >= 0),
  target_ready_at timestamptz,
  ai_generated boolean not null default false,
  ai_summary text,
  ai_assumptions jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (car_plan_id, version_number),
  check (
    (status = 'approved' and approved_at is not null and approved_by is not null)
    or status <> 'approved'
  ),
  check (
    version_number = 1
    or parent_version_id is not null
  )
);

alter table public.mindful_inventory_car_plans
  add constraint mindful_inventory_car_plans_current_version_fk
  foreign key (current_approved_version_id)
  references public.mindful_inventory_car_plan_versions(id)
  on delete restrict;

create index mindful_inventory_car_plan_versions_plan_idx
  on public.mindful_inventory_car_plan_versions(car_plan_id, version_number desc);

create index mindful_inventory_car_plan_versions_status_idx
  on public.mindful_inventory_car_plan_versions(car_plan_id, status);

create table public.mindful_inventory_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_version_id uuid not null references public.mindful_inventory_car_plan_versions(id) on delete cascade,
  finding_id uuid references public.mindful_inventory_findings(id) on delete set null,
  stable_item_key uuid not null default gen_random_uuid(),
  title text not null,
  description text,
  category text not null default 'other',
  subcategory text,
  classification public.mindful_inventory_plan_item_classification not null,
  decision public.mindful_inventory_plan_item_decision not null,
  priority public.mindful_inventory_vehicle_priority not null default '2',
  rationale text,
  estimated_cost_low numeric(12,2) check (estimated_cost_low is null or estimated_cost_low >= 0),
  estimated_cost_high numeric(12,2) check (estimated_cost_high is null or estimated_cost_high >= 0),
  planning_amount numeric(12,2) not null default 0 check (planning_amount >= 0),
  estimated_duration_hours numeric(8,2) check (estimated_duration_hours is null or estimated_duration_hours >= 0),
  suggested_partner_id uuid references public.mindful_inventory_partners(id) on delete set null,
  decline_reason text,
  sequence_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_version_id, stable_item_key),
  check (
    estimated_cost_low is null
    or estimated_cost_high is null
    or estimated_cost_high >= estimated_cost_low
  ),
  check (
    decision <> 'declined'
    or nullif(trim(decline_reason), '') is not null
  )
);

create index mindful_inventory_plan_items_version_idx
  on public.mindful_inventory_plan_items(plan_version_id, sequence_order, created_at);

create index mindful_inventory_plan_items_finding_idx
  on public.mindful_inventory_plan_items(finding_id)
  where finding_id is not null;

create index mindful_inventory_plan_items_stable_key_idx
  on public.mindful_inventory_plan_items(stable_item_key);

create table public.mindful_inventory_plan_change_requests (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.mindful_inventory_vehicles(id) on delete cascade,
  car_plan_id uuid not null references public.mindful_inventory_car_plans(id) on delete cascade,
  work_order_id uuid,
  requested_by_user_id uuid references auth.users(id) on delete set null,
  requested_by_partner_id uuid references public.mindful_inventory_partners(id) on delete set null,
  status public.mindful_inventory_plan_change_request_status not null default 'pending',
  summary text not null,
  reason text,
  proposed_cost_change numeric(12,2),
  proposed_duration_hours numeric(8,2),
  schedule_impact_notes text,
  current_work_can_continue boolean,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  resulting_plan_version_id uuid references public.mindful_inventory_car_plan_versions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    requested_by_user_id is null
    or requested_by_partner_id is null
  ),
  check (
    status = 'pending'
    or reviewed_at is not null
  )
);

create index mindful_inventory_plan_change_requests_vehicle_status_idx
  on public.mindful_inventory_plan_change_requests(vehicle_id, status, created_at desc);

create index mindful_inventory_plan_change_requests_plan_idx
  on public.mindful_inventory_plan_change_requests(car_plan_id, created_at desc);

-- Approved plan versions and their item snapshots are permanent history.
create or replace function public.prevent_mindful_inventory_approved_plan_version_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'approved' then
    raise exception 'Approved Car Plan versions are immutable.';
  end if;
  return new;
end;
$$;

create trigger mindful_inventory_car_plan_versions_immutable_trigger
before update or delete on public.mindful_inventory_car_plan_versions
for each row execute function public.prevent_mindful_inventory_approved_plan_version_mutation();

create or replace function public.prevent_mindful_inventory_approved_plan_item_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.mindful_inventory_car_plan_versions version
    where version.id = old.plan_version_id
      and version.status = 'approved'
  ) then
    raise exception 'Items in an approved Car Plan version are immutable.';
  end if;
  return new;
end;
$$;

create trigger mindful_inventory_plan_items_immutable_trigger
before update or delete on public.mindful_inventory_plan_items
for each row execute function public.prevent_mindful_inventory_approved_plan_item_mutation();

alter table public.mindful_inventory_car_plans enable row level security;
alter table public.mindful_inventory_car_plan_versions enable row level security;
alter table public.mindful_inventory_plan_items enable row level security;
alter table public.mindful_inventory_plan_change_requests enable row level security;
