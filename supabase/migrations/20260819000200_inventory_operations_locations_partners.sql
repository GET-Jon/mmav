-- Lot Logic Inventory Operations — locations, resources, partners, and partner permissions.
-- Inventory-owned architecture; shared dependencies are limited to companies and auth.users.

create table public.mindful_inventory_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  location_type text not null check (
    location_type in (
      'mindful_facility',
      'partner',
      'auction',
      'storage',
      'transport',
      'other'
    )
  ),
  address_line_1 text,
  address_line_2 text,
  city text,
  state text,
  postal_code text,
  country text not null default 'US',
  active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mindful_inventory_locations_company_idx
  on public.mindful_inventory_locations(company_id);

create index mindful_inventory_locations_company_active_idx
  on public.mindful_inventory_locations(company_id, active);

create table public.mindful_inventory_resources (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.mindful_inventory_locations(id) on delete cascade,
  name text not null,
  resource_type text not null default 'other',
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, name)
);

create index mindful_inventory_resources_location_idx
  on public.mindful_inventory_resources(location_id);

create table public.mindful_inventory_partners (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  company_name text,
  email text,
  phone text,
  active boolean not null default true,
  scheduling_mode public.mindful_inventory_partner_scheduling_mode not null
    default 'manager_scheduled',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mindful_inventory_partners_company_idx
  on public.mindful_inventory_partners(company_id);

create index mindful_inventory_partners_user_idx
  on public.mindful_inventory_partners(user_id)
  where user_id is not null;

create unique index mindful_inventory_partners_company_user_unique_idx
  on public.mindful_inventory_partners(company_id, user_id)
  where user_id is not null;

create table public.mindful_inventory_partner_capabilities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create table public.mindful_inventory_partner_capability_assignments (
  partner_id uuid not null references public.mindful_inventory_partners(id) on delete cascade,
  capability_id uuid not null references public.mindful_inventory_partner_capabilities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (partner_id, capability_id)
);

create table public.mindful_inventory_partner_permissions (
  partner_id uuid primary key references public.mindful_inventory_partners(id) on delete cascade,
  view_assigned_work boolean not null default true,
  start_work boolean not null default false,
  complete_work boolean not null default false,
  upload_media boolean not null default false,
  add_notes boolean not null default false,
  report_blocker boolean not null default false,
  update_parts boolean not null default false,
  update_actual_cost boolean not null default false,
  submit_invoice boolean not null default false,
  reschedule_work boolean not null default false,
  add_finding boolean not null default false,
  propose_additional_work boolean not null default false,
  request_plan_change boolean not null default false,
  edit_estimate boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mindful_inventory_partner_locations (
  partner_id uuid not null references public.mindful_inventory_partners(id) on delete cascade,
  location_id uuid not null references public.mindful_inventory_locations(id) on delete cascade,
  is_primary boolean not null default false,
  can_work_mobile boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (partner_id, location_id)
);

create table public.mindful_inventory_partner_availability (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.mindful_inventory_partners(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  availability_type text not null default 'available'
    check (availability_type in ('available', 'unavailable')),
  recurrence_rule text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index mindful_inventory_partner_availability_partner_time_idx
  on public.mindful_inventory_partner_availability(partner_id, starts_at, ends_at);

-- RLS is intentionally enabled now, but policies are added in the dedicated
-- Inventory Operations RLS migration once the complete entity graph exists.
alter table public.mindful_inventory_locations enable row level security;
alter table public.mindful_inventory_resources enable row level security;
alter table public.mindful_inventory_partners enable row level security;
alter table public.mindful_inventory_partner_capabilities enable row level security;
alter table public.mindful_inventory_partner_capability_assignments enable row level security;
alter table public.mindful_inventory_partner_permissions enable row level security;
alter table public.mindful_inventory_partner_locations enable row level security;
alter table public.mindful_inventory_partner_availability enable row level security;
