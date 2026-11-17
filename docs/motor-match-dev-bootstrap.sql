-- Motor Match development database bootstrap.
-- IMPORTANT: Execute ONLY against the NEW independent motor-match-dev project.
-- Do NOT run on MAVV-tool or merge as an automatic production migration.
create extension if not exists pgcrypto;

create table if not exists public.mm_customers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  contact_email text,
  contact_phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.mm_search_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.mm_customers(id) on delete set null,
  source text not null default 'website',
  status text not null default 'new' check (status in ('new','reviewing','sourcing','matched','closed')),
  original_vehicle text not null,
  original_budget numeric(12,2) not null check (original_budget > 0),
  original_max_mileage integer check (original_max_mileage > 0),
  original_mileage_flexible boolean not null default false,
  current_vehicle text not null,
  current_budget numeric(12,2) not null check (current_budget > 0),
  current_max_mileage integer check (current_max_mileage > 0),
  current_mileage_flexible boolean not null default false,
  allow_alternatives boolean not null default true,
  has_trade text not null default 'no' check (has_trade in ('yes','maybe','no')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mm_search_adjustments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.mm_search_requests(id) on delete cascade,
  field text not null check (field in ('vehicle','budget','mileage')),
  previous_value text not null,
  next_value text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.mm_acceptable_vehicles (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.mm_search_requests(id) on delete cascade,
  vehicle_description text not null,
  preference text not null default 'acceptable' check (preference in ('primary','acceptable','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.mm_seller_vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.mm_customers(id) on delete set null,
  vin text,
  vehicle_description text,
  mileage integer check (mileage >= 0),
  asking_price numeric(12,2),
  payoff_estimate numeric(12,2),
  lienholder text,
  created_at timestamptz not null default now()
);

create table if not exists public.mm_vehicle_matches (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.mm_search_requests(id) on delete cascade,
  seller_vehicle_id uuid references public.mm_seller_vehicles(id) on delete set null,
  external_listing_url text,
  match_class text not null check (match_class in ('exact','alternative','outside_preferences')),
  explanation text,
  review_status text not null default 'unreviewed' check (review_status in ('unreviewed','approved','rejected')),
  created_at timestamptz not null default now(),
  check (seller_vehicle_id is not null or external_listing_url is not null)
);

create index if not exists mm_search_requests_customer_id_idx on public.mm_search_requests(customer_id);
create index if not exists mm_search_adjustments_request_id_idx on public.mm_search_adjustments(request_id);
create index if not exists mm_acceptable_vehicles_request_id_idx on public.mm_acceptable_vehicles(request_id);
create index if not exists mm_vehicle_matches_request_id_idx on public.mm_vehicle_matches(request_id);

-- All tables are private by default. No anon/authenticated policies yet.
-- An audited, rate-limited server submission endpoint will be added after provisioning.
alter table public.mm_customers enable row level security;
alter table public.mm_search_requests enable row level security;
alter table public.mm_search_adjustments enable row level security;
alter table public.mm_acceptable_vehicles enable row level security;
alter table public.mm_seller_vehicles enable row level security;
alter table public.mm_vehicle_matches enable row level security;

revoke all on public.mm_customers from anon, authenticated;
revoke all on public.mm_search_requests from anon, authenticated;
revoke all on public.mm_search_adjustments from anon, authenticated;
revoke all on public.mm_acceptable_vehicles from anon, authenticated;
revoke all on public.mm_seller_vehicles from anon, authenticated;
revoke all on public.mm_vehicle_matches from anon, authenticated;
