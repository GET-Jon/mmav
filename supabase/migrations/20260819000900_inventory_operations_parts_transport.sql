-- Lot Logic Inventory Operations — Parts, Vehicle Movements, and Transportation.
-- V1 models operational readiness without becoming a warehouse or carrier platform.

create table public.mindful_inventory_work_order_parts (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.mindful_inventory_work_orders(id) on delete cascade,
  description text not null,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  supplier text,
  supplier_reference text,
  quoted_unit_price numeric(12,2) check (quoted_unit_price is null or quoted_unit_price >= 0),
  actual_unit_price numeric(12,2) check (actual_unit_price is null or actual_unit_price >= 0),
  status text not null default 'needed' check (
    status in ('needed', 'ordered', 'backordered', 'received', 'cancelled')
  ),
  ordered_at timestamptz,
  eta_at timestamptz,
  received_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'ordered' or ordered_at is not null),
  check (status <> 'received' or received_at is not null)
);

create index mindful_inventory_work_order_parts_work_idx
  on public.mindful_inventory_work_order_parts(work_order_id, status);

create index mindful_inventory_work_order_parts_eta_idx
  on public.mindful_inventory_work_order_parts(eta_at)
  where eta_at is not null and status in ('ordered', 'backordered');

create table public.mindful_inventory_vehicle_movements (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.mindful_inventory_vehicles(id) on delete cascade,
  origin_location_id uuid references public.mindful_inventory_locations(id) on delete set null,
  destination_location_id uuid references public.mindful_inventory_locations(id) on delete set null,
  movement_type text not null default 'manual' check (
    movement_type in ('manual', 'transportation', 'partner_handoff', 'internal', 'other')
  ),
  status text not null default 'planned' check (
    status in ('planned', 'in_transit', 'arrived', 'cancelled')
  ),
  departed_at timestamptz,
  arrived_at timestamptz,
  recorded_by_user_id uuid references auth.users(id) on delete set null,
  recorded_by_partner_id uuid references public.mindful_inventory_partners(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  check (
    recorded_by_user_id is null
    or recorded_by_partner_id is null
  ),
  check (status <> 'in_transit' or departed_at is not null),
  check (status <> 'arrived' or arrived_at is not null),
  check (
    departed_at is null
    or arrived_at is null
    or arrived_at >= departed_at
  )
);

create index mindful_inventory_vehicle_movements_vehicle_created_idx
  on public.mindful_inventory_vehicle_movements(vehicle_id, created_at desc);

create index mindful_inventory_vehicle_movements_vehicle_status_idx
  on public.mindful_inventory_vehicle_movements(vehicle_id, status);

create table public.mindful_inventory_transportation (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.mindful_inventory_vehicles(id) on delete cascade,
  origin_location_id uuid references public.mindful_inventory_locations(id) on delete set null,
  destination_location_id uuid references public.mindful_inventory_locations(id) on delete set null,
  transporter_partner_id uuid references public.mindful_inventory_partners(id) on delete set null,
  external_transporter_name text,
  contact_name text,
  contact_phone text,
  status public.mindful_inventory_transport_status not null default 'requested',
  pickup_scheduled_at timestamptz,
  expected_delivery_at timestamptz,
  actual_pickup_at timestamptz,
  actual_delivery_at timestamptz,
  tracking_reference text,
  quoted_cost numeric(12,2) check (quoted_cost is null or quoted_cost >= 0),
  actual_cost numeric(12,2) check (actual_cost is null or actual_cost >= 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    transporter_partner_id is not null
    or external_transporter_name is not null
    or status = 'requested'
  ),
  check (
    pickup_scheduled_at is null
    or expected_delivery_at is null
    or expected_delivery_at >= pickup_scheduled_at
  ),
  check (
    actual_pickup_at is null
    or actual_delivery_at is null
    or actual_delivery_at >= actual_pickup_at
  ),
  check (status <> 'in_transit' or actual_pickup_at is not null),
  check (status <> 'delivered' or actual_delivery_at is not null)
);

create index mindful_inventory_transportation_vehicle_status_idx
  on public.mindful_inventory_transportation(vehicle_id, status, created_at desc);

create index mindful_inventory_transportation_partner_status_idx
  on public.mindful_inventory_transportation(transporter_partner_id, status)
  where transporter_partner_id is not null;

create index mindful_inventory_transportation_expected_delivery_idx
  on public.mindful_inventory_transportation(expected_delivery_at)
  where expected_delivery_at is not null and status not in ('delivered', 'cancelled');

alter table public.mindful_inventory_work_order_parts enable row level security;
alter table public.mindful_inventory_vehicle_movements enable row level security;
alter table public.mindful_inventory_transportation enable row level security;
