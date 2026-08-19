-- Lot Logic Inventory Operations — Intake, Inspection, and Findings.
-- A Finding is an observation. It is not authorized work.

create table public.mindful_inventory_intakes (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.mindful_inventory_vehicles(id) on delete cascade,
  performed_by_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'complete')),
  started_at timestamptz,
  completed_at timestamptz,
  mileage integer check (mileage is null or mileage >= 0),
  keys_count integer check (keys_count is null or keys_count >= 0),
  visible_damage_summary text,
  initial_observations text,
  preliminary_grade public.mindful_inventory_vehicle_grade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'complete' or completed_at is not null)
);

create unique index mindful_inventory_intakes_vehicle_unique_idx
  on public.mindful_inventory_intakes(vehicle_id);

create table public.mindful_inventory_inspections (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.mindful_inventory_vehicles(id) on delete cascade,
  inspection_type text not null default 'mechanical',
  performed_by_user_id uuid references auth.users(id) on delete set null,
  performed_by_partner_id uuid references public.mindful_inventory_partners(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'in_progress', 'complete', 'cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    performed_by_user_id is null
    or performed_by_partner_id is null
  ),
  check (status <> 'complete' or completed_at is not null)
);

create index mindful_inventory_inspections_vehicle_idx
  on public.mindful_inventory_inspections(vehicle_id);

create index mindful_inventory_inspections_vehicle_status_idx
  on public.mindful_inventory_inspections(vehicle_id, status);

create table public.mindful_inventory_findings (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.mindful_inventory_vehicles(id) on delete cascade,
  intake_id uuid references public.mindful_inventory_intakes(id) on delete set null,
  inspection_id uuid references public.mindful_inventory_inspections(id) on delete set null,

  source public.mindful_inventory_finding_source not null,
  source_user_id uuid references auth.users(id) on delete set null,
  source_partner_id uuid references public.mindful_inventory_partners(id) on delete set null,
  source_evaluation_id uuid,
  source_reference text,

  title text not null,
  description text,
  category text not null default 'other',
  subcategory text,

  severity public.mindful_inventory_finding_severity,
  confidence text,
  certainty text,

  estimated_cost_low numeric(12,2) check (estimated_cost_low is null or estimated_cost_low >= 0),
  estimated_cost_high numeric(12,2) check (estimated_cost_high is null or estimated_cost_high >= 0),
  estimated_duration_hours numeric(8,2) check (estimated_duration_hours is null or estimated_duration_hours >= 0),

  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    estimated_cost_low is null
    or estimated_cost_high is null
    or estimated_cost_high >= estimated_cost_low
  ),
  check (
    source_user_id is null
    or source_partner_id is null
  ),
  check (
    status = 'open'
    or resolved_at is not null
  )
);

create index mindful_inventory_findings_vehicle_idx
  on public.mindful_inventory_findings(vehicle_id);

create index mindful_inventory_findings_vehicle_status_idx
  on public.mindful_inventory_findings(vehicle_id, status);

create index mindful_inventory_findings_inspection_idx
  on public.mindful_inventory_findings(inspection_id)
  where inspection_id is not null;

create index mindful_inventory_findings_source_evaluation_idx
  on public.mindful_inventory_findings(source_evaluation_id)
  where source_evaluation_id is not null;

alter table public.mindful_inventory_intakes enable row level security;
alter table public.mindful_inventory_inspections enable row level security;
alter table public.mindful_inventory_findings enable row level security;
