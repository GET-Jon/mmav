-- Lot Logic Inventory Operations — canonical vehicle root.
-- Inventory consumes a purchase-time Lot Logic snapshot but does not depend on
-- evaluator calculations after handoff.

create table public.mindful_inventory_vehicles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  source_evaluation_id uuid,
  source_snapshot jsonb not null default '{}'::jsonb,

  stock_number text,
  vin text,
  year integer not null check (year between 1886 and 2200),
  make text not null,
  model text not null,
  trim text,
  mileage integer check (mileage is null or mileage >= 0),
  image_url text,

  project_owner_user_id uuid references auth.users(id) on delete set null,

  phase public.mindful_inventory_vehicle_phase not null default 'purchased',
  grade public.mindful_inventory_vehicle_grade,
  priority public.mindful_inventory_vehicle_priority not null default '2',
  health public.mindful_inventory_vehicle_health not null default 'on_track',

  current_location_id uuid references public.mindful_inventory_locations(id) on delete set null,

  next_action text,
  next_action_owner_user_id uuid references auth.users(id) on delete set null,
  next_action_owner_partner_id uuid references public.mindful_inventory_partners(id) on delete set null,
  next_action_due_at timestamptz,

  target_ready_at timestamptz,
  forecast_ready_at timestamptz,

  hold_active boolean not null default false,
  hold_reason text,
  hold_owner_user_id uuid references auth.users(id) on delete set null,
  hold_follow_up_at timestamptz,

  exit_status text check (
    exit_status is null
    or exit_status in ('wholesale', 'auction', 'as_is_sale', 'arbitration_return', 'other')
  ),
  exit_reason text,
  exited_at timestamptz,

  purchase_date date,
  purchase_price numeric(12,2) not null default 0 check (purchase_price >= 0),
  buyer_fees numeric(12,2) not null default 0 check (buyer_fees >= 0),
  other_acquisition_cost numeric(12,2) not null default 0 check (other_acquisition_cost >= 0),
  expected_sale_price numeric(12,2) check (expected_sale_price is null or expected_sale_price >= 0),

  title_status text not null default 'unknown' check (
    title_status in ('unknown', 'awaiting', 'received', 'issue', 'not_applicable')
  ),

  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    next_action_owner_user_id is null
    or next_action_owner_partner_id is null
  ),
  check (
    not hold_active
    or hold_reason is not null
  )
);

create index mindful_inventory_vehicles_company_idx
  on public.mindful_inventory_vehicles(company_id);

create index mindful_inventory_vehicles_company_phase_idx
  on public.mindful_inventory_vehicles(company_id, phase);

create index mindful_inventory_vehicles_company_health_idx
  on public.mindful_inventory_vehicles(company_id, health);

create index mindful_inventory_vehicles_project_owner_idx
  on public.mindful_inventory_vehicles(project_owner_user_id)
  where project_owner_user_id is not null;

create index mindful_inventory_vehicles_location_idx
  on public.mindful_inventory_vehicles(current_location_id)
  where current_location_id is not null;

create index mindful_inventory_vehicles_next_action_user_idx
  on public.mindful_inventory_vehicles(next_action_owner_user_id)
  where next_action_owner_user_id is not null;

create index mindful_inventory_vehicles_next_action_partner_idx
  on public.mindful_inventory_vehicles(next_action_owner_partner_id)
  where next_action_owner_partner_id is not null;

create unique index mindful_inventory_vehicles_company_stock_number_unique_idx
  on public.mindful_inventory_vehicles(company_id, stock_number)
  where stock_number is not null;

create unique index mindful_inventory_vehicles_source_evaluation_unique_idx
  on public.mindful_inventory_vehicles(source_evaluation_id)
  where source_evaluation_id is not null;

alter table public.mindful_inventory_vehicles enable row level security;
