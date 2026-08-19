-- Lot Logic Inventory Operations — Work Orders and execution dependencies.
-- Plan Items define authorized intent; Work Orders execute that intent.

create table public.mindful_inventory_work_orders (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.mindful_inventory_vehicles(id) on delete cascade,
  plan_item_id uuid not null references public.mindful_inventory_plan_items(id) on delete restrict,
  plan_version_id uuid not null references public.mindful_inventory_car_plan_versions(id) on delete restrict,
  finding_id uuid references public.mindful_inventory_findings(id) on delete set null,

  source_type text not null default 'car_plan' check (
    source_type in ('car_plan', 'plan_change', 'qc_rework', 'manager_override')
  ),
  source_reference text,

  title text not null,
  description text,
  category text not null default 'other',
  subcategory text,
  classification public.mindful_inventory_plan_item_classification not null,
  department text,

  project_owner_user_id uuid references auth.users(id) on delete set null,
  next_action_owner_user_id uuid references auth.users(id) on delete set null,
  next_action_owner_partner_id uuid references public.mindful_inventory_partners(id) on delete set null,
  assigned_partner_id uuid references public.mindful_inventory_partners(id) on delete set null,

  location_id uuid references public.mindful_inventory_locations(id) on delete set null,
  destination_location_id uuid references public.mindful_inventory_locations(id) on delete set null,
  resource_id uuid references public.mindful_inventory_resources(id) on delete set null,

  status public.mindful_inventory_work_order_status not null default 'planned',
  blocker_reason text,
  blocker_owner_user_id uuid references auth.users(id) on delete set null,
  blocker_owner_partner_id uuid references public.mindful_inventory_partners(id) on delete set null,
  blocker_follow_up_at timestamptz,

  estimated_duration_minutes integer check (estimated_duration_minutes is null or estimated_duration_minutes >= 0),
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  actual_labor_minutes integer check (actual_labor_minutes is null or actual_labor_minutes >= 0),
  due_at timestamptz,

  initial_estimate numeric(12,2) not null default 0 check (initial_estimate >= 0),
  approved_budget numeric(12,2) not null default 0 check (approved_budget >= 0),
  current_forecast numeric(12,2) not null default 0 check (current_forecast >= 0),
  actual_cost numeric(12,2) check (actual_cost is null or actual_cost >= 0),
  labor_cost numeric(12,2) check (labor_cost is null or labor_cost >= 0),
  parts_cost numeric(12,2) check (parts_cost is null or parts_cost >= 0),
  fees_cost numeric(12,2) check (fees_cost is null or fees_cost >= 0),

  difficulty public.mindful_inventory_work_difficulty,
  difficulty_reason text,

  completion_notes text,
  completed_by_user_id uuid references auth.users(id) on delete set null,
  completed_by_partner_id uuid references public.mindful_inventory_partners(id) on delete set null,

  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    next_action_owner_user_id is null
    or next_action_owner_partner_id is null
  ),
  check (
    blocker_owner_user_id is null
    or blocker_owner_partner_id is null
  ),
  check (
    completed_by_user_id is null
    or completed_by_partner_id is null
  ),
  check (
    scheduled_start_at is null
    or scheduled_end_at is null
    or scheduled_end_at >= scheduled_start_at
  ),
  check (
    actual_start_at is null
    or actual_end_at is null
    or actual_end_at >= actual_start_at
  ),
  check (
    status <> 'blocked'
    or nullif(trim(blocker_reason), '') is not null
  ),
  check (
    status <> 'complete'
    or actual_end_at is not null
  )
);

create index mindful_inventory_work_orders_vehicle_status_idx
  on public.mindful_inventory_work_orders(vehicle_id, status, created_at);

create index mindful_inventory_work_orders_plan_item_idx
  on public.mindful_inventory_work_orders(plan_item_id);

create index mindful_inventory_work_orders_partner_status_idx
  on public.mindful_inventory_work_orders(assigned_partner_id, status)
  where assigned_partner_id is not null;

create index mindful_inventory_work_orders_next_action_user_idx
  on public.mindful_inventory_work_orders(next_action_owner_user_id, status)
  where next_action_owner_user_id is not null;

create index mindful_inventory_work_orders_next_action_partner_idx
  on public.mindful_inventory_work_orders(next_action_owner_partner_id, status)
  where next_action_owner_partner_id is not null;

create index mindful_inventory_work_orders_schedule_idx
  on public.mindful_inventory_work_orders(scheduled_start_at, scheduled_end_at)
  where scheduled_start_at is not null;

create index mindful_inventory_work_orders_location_idx
  on public.mindful_inventory_work_orders(location_id, status)
  where location_id is not null;

create table public.mindful_inventory_work_dependencies (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.mindful_inventory_work_orders(id) on delete cascade,
  depends_on_work_order_id uuid not null references public.mindful_inventory_work_orders(id) on delete cascade,
  dependency_type text not null default 'finish_to_start' check (
    dependency_type in ('finish_to_start', 'vehicle_at_location', 'parts_received', 'other')
  ),
  notes text,
  created_at timestamptz not null default now(),
  unique (work_order_id, depends_on_work_order_id),
  check (work_order_id <> depends_on_work_order_id)
);

create index mindful_inventory_work_dependencies_prerequisite_idx
  on public.mindful_inventory_work_dependencies(depends_on_work_order_id);

create table public.mindful_inventory_work_completion_requirements (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.mindful_inventory_work_orders(id) on delete cascade,
  requirement_type text not null check (
    requirement_type in ('checklist', 'before_photo', 'after_photo', 'invoice', 'actual_cost', 'actual_time', 'notes', 'document', 'other')
  ),
  label text not null,
  required boolean not null default true,
  completed boolean not null default false,
  completed_at timestamptz,
  completed_by_user_id uuid references auth.users(id) on delete set null,
  completed_by_partner_id uuid references public.mindful_inventory_partners(id) on delete set null,
  sequence_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    completed_by_user_id is null
    or completed_by_partner_id is null
  ),
  check (
    not completed
    or completed_at is not null
  )
);

create index mindful_inventory_work_completion_requirements_work_idx
  on public.mindful_inventory_work_completion_requirements(work_order_id, sequence_order);

alter table public.mindful_inventory_plan_change_requests
  add constraint mindful_inventory_plan_change_requests_work_order_fk
  foreign key (work_order_id)
  references public.mindful_inventory_work_orders(id)
  on delete set null;

alter table public.mindful_inventory_work_orders enable row level security;
alter table public.mindful_inventory_work_dependencies enable row level security;
alter table public.mindful_inventory_work_completion_requirements enable row level security;
