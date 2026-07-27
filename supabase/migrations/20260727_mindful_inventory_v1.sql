-- Mindful Inventory V1
--
-- This module is intentionally downstream from Lot Logic:
-- - It may reference and snapshot saved evaluations.
-- - It never updates saved evaluations or any other core Lot Logic table.
-- - Removing these tables must not affect the evaluator.

create table if not exists public.mindful_inventory_vehicles (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.companies(id)
    on delete cascade,

  -- Optional, read-only traceability to the originating Lot Logic evaluation.
  -- SET NULL ensures an inventory vehicle survives if its evaluation is deleted.
  source_evaluation_id uuid null,

  stock_number text,
  vin text,
  year integer not null,
  make text not null,
  model text not null,
  trim text,
  mileage integer,
  image_url text,

  purchase_date date,
  purchase_price numeric(12,2) not null default 0
    check (purchase_price >= 0),
  buyer_fees numeric(12,2) not null default 0
    check (buyer_fees >= 0),
  transport_cost numeric(12,2) not null default 0
    check (transport_cost >= 0),
  other_acquisition_cost numeric(12,2) not null default 0
    check (other_acquisition_cost >= 0),

  stage text not null default 'received'
    check (
      stage in (
        'purchased',
        'awaiting_transport',
        'received',
        'inspection',
        'work_scoping',
        'parts_ordered',
        'in_service',
        'awaiting_detail',
        'ready_for_sale',
        'listed',
        'sale_pending',
        'sold',
        'blocked'
      )
    ),

  current_location text,

  title_status text not null default 'unknown'
    check (
      title_status in (
        'unknown',
        'awaiting',
        'received',
        'issue',
        'not_applicable'
      )
    ),

  target_ready_date date,

  expected_sale_price numeric(12,2)
    check (
      expected_sale_price is null
      or expected_sale_price >= 0
    ),

  actual_sale_price numeric(12,2)
    check (
      actual_sale_price is null
      or actual_sale_price >= 0
    ),

  sold_date date,

  next_action text,
  next_action_owner text,
  next_action_due_date date,

  notes text,

  -- Snapshot of selected Lot Logic values at the moment of import.
  -- Inventory does not subsequently sync these values back or forward.
  source_snapshot jsonb not null default '{}'::jsonb,

  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,

  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mindful_inventory_vehicles_company_idx
  on public.mindful_inventory_vehicles(company_id);

create index if not exists mindful_inventory_vehicles_company_stage_idx
  on public.mindful_inventory_vehicles(company_id, stage);

create index if not exists mindful_inventory_vehicles_source_evaluation_idx
  on public.mindful_inventory_vehicles(source_evaluation_id);

create unique index if not exists mindful_inventory_vehicles_company_stock_number_idx
  on public.mindful_inventory_vehicles(company_id, stock_number)
  where stock_number is not null;

create table if not exists public.mindful_inventory_work_items (
  id uuid primary key default gen_random_uuid(),

  inventory_vehicle_id uuid not null
    references public.mindful_inventory_vehicles(id)
    on delete cascade,

  description text not null,

  category text not null default 'other'
    check (
      category in (
        'mechanical',
        'maintenance',
        'tires_wheels',
        'cosmetic',
        'interior',
        'detailing',
        'transportation',
        'title_registration',
        'inspection',
        'photography_listing',
        'other'
      )
    ),

  priority text not null default 'recommended'
    check (
      priority in (
        'required',
        'recommended',
        'optional'
      )
    ),

  status text not null default 'not_started'
    check (
      status in (
        'not_started',
        'awaiting_approval',
        'approved',
        'scheduled',
        'in_progress',
        'complete',
        'cancelled'
      )
    ),

  vendor text,

  estimated_cost numeric(12,2) not null default 0
    check (estimated_cost >= 0),

  actual_cost numeric(12,2)
    check (
      actual_cost is null
      or actual_cost >= 0
    ),

  scheduled_date date,
  completed_date date,

  requires_approval boolean not null default false,
  approved_at timestamptz,

  notes text,

  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mindful_inventory_work_items_vehicle_idx
  on public.mindful_inventory_work_items(inventory_vehicle_id);

create index if not exists mindful_inventory_work_items_vehicle_status_idx
  on public.mindful_inventory_work_items(
    inventory_vehicle_id,
    status
  );

create table if not exists public.mindful_inventory_activity (
  id uuid primary key default gen_random_uuid(),

  inventory_vehicle_id uuid not null
    references public.mindful_inventory_vehicles(id)
    on delete cascade,

  action text not null,
  description text,

  actor_user_id uuid references auth.users(id) on delete set null,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists mindful_inventory_activity_vehicle_created_idx
  on public.mindful_inventory_activity(
    inventory_vehicle_id,
    created_at desc
  );

alter table public.mindful_inventory_vehicles
  enable row level security;

alter table public.mindful_inventory_work_items
  enable row level security;

alter table public.mindful_inventory_activity
  enable row level security;

-- Vehicle policies

drop policy if exists
  "mindful members can view inventory vehicles"
  on public.mindful_inventory_vehicles;

create policy
  "mindful members can view inventory vehicles"
on public.mindful_inventory_vehicles
for select
using (
  public.is_company_member(company_id)
  and exists (
    select 1
    from public.companies company
    where company.id = company_id
      and company.slug = 'mindful-motor-co'
      and company.status = 'active'
  )
);

drop policy if exists
  "mindful members can create inventory vehicles"
  on public.mindful_inventory_vehicles;

create policy
  "mindful members can create inventory vehicles"
on public.mindful_inventory_vehicles
for insert
with check (
  public.is_company_member(company_id)
  and exists (
    select 1
    from public.companies company
    where company.id = company_id
      and company.slug = 'mindful-motor-co'
      and company.status = 'active'
  )
);

drop policy if exists
  "mindful members can update inventory vehicles"
  on public.mindful_inventory_vehicles;

create policy
  "mindful members can update inventory vehicles"
on public.mindful_inventory_vehicles
for update
using (
  public.is_company_member(company_id)
  and exists (
    select 1
    from public.companies company
    where company.id = company_id
      and company.slug = 'mindful-motor-co'
      and company.status = 'active'
  )
)
with check (
  public.is_company_member(company_id)
  and exists (
    select 1
    from public.companies company
    where company.id = company_id
      and company.slug = 'mindful-motor-co'
      and company.status = 'active'
  )
);

drop policy if exists
  "mindful members can delete inventory vehicles"
  on public.mindful_inventory_vehicles;

create policy
  "mindful members can delete inventory vehicles"
on public.mindful_inventory_vehicles
for delete
using (
  public.is_company_member(company_id)
  and exists (
    select 1
    from public.companies company
    where company.id = company_id
      and company.slug = 'mindful-motor-co'
      and company.status = 'active'
  )
);

-- Work-item policies derive access from the parent vehicle.

drop policy if exists
  "mindful members can view inventory work items"
  on public.mindful_inventory_work_items;

create policy
  "mindful members can view inventory work items"
on public.mindful_inventory_work_items
for select
using (
  exists (
    select 1
    from public.mindful_inventory_vehicles vehicle
    where vehicle.id = inventory_vehicle_id
      and public.is_company_member(vehicle.company_id)
      and exists (
        select 1
        from public.companies company
        where company.id = vehicle.company_id
          and company.slug = 'mindful-motor-co'
          and company.status = 'active'
      )
  )
);

drop policy if exists
  "mindful members can create inventory work items"
  on public.mindful_inventory_work_items;

create policy
  "mindful members can create inventory work items"
on public.mindful_inventory_work_items
for insert
with check (
  exists (
    select 1
    from public.mindful_inventory_vehicles vehicle
    where vehicle.id = inventory_vehicle_id
      and public.is_company_member(vehicle.company_id)
      and exists (
        select 1
        from public.companies company
        where company.id = vehicle.company_id
          and company.slug = 'mindful-motor-co'
          and company.status = 'active'
      )
  )
);

drop policy if exists
  "mindful members can update inventory work items"
  on public.mindful_inventory_work_items;

create policy
  "mindful members can update inventory work items"
on public.mindful_inventory_work_items
for update
using (
  exists (
    select 1
    from public.mindful_inventory_vehicles vehicle
    where vehicle.id = inventory_vehicle_id
      and public.is_company_member(vehicle.company_id)
  )
)
with check (
  exists (
    select 1
    from public.mindful_inventory_vehicles vehicle
    where vehicle.id = inventory_vehicle_id
      and public.is_company_member(vehicle.company_id)
  )
);

drop policy if exists
  "mindful members can delete inventory work items"
  on public.mindful_inventory_work_items;

create policy
  "mindful members can delete inventory work items"
on public.mindful_inventory_work_items
for delete
using (
  exists (
    select 1
    from public.mindful_inventory_vehicles vehicle
    where vehicle.id = inventory_vehicle_id
      and public.is_company_member(vehicle.company_id)
  )
);

-- Activity policies

drop policy if exists
  "mindful members can view inventory activity"
  on public.mindful_inventory_activity;

create policy
  "mindful members can view inventory activity"
on public.mindful_inventory_activity
for select
using (
  exists (
    select 1
    from public.mindful_inventory_vehicles vehicle
    where vehicle.id = inventory_vehicle_id
      and public.is_company_member(vehicle.company_id)
  )
);

drop policy if exists
  "mindful members can create inventory activity"
  on public.mindful_inventory_activity;

create policy
  "mindful members can create inventory activity"
on public.mindful_inventory_activity
for insert
with check (
  exists (
    select 1
    from public.mindful_inventory_vehicles vehicle
    where vehicle.id = inventory_vehicle_id
      and public.is_company_member(vehicle.company_id)
  )
);
