create table if not exists public.motor_match_market_runs (
  id uuid primary key default gen_random_uuid(),
  cycle_key text not null,
  status text not null default 'active' check (status in ('active','completed','stopped','failed')),
  core_call_budget integer not null default 275,
  max_call_budget integer not null default 350,
  calls_used integer not null default 0,
  observations_stored integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists motor_match_market_runs_active_cycle_idx
  on public.motor_match_market_runs (cycle_key)
  where status = 'active';

create table if not exists public.motor_match_market_fetches (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.motor_match_market_runs(id) on delete cascade,
  make text not null,
  model text not null,
  planned_sequence integer not null,
  sort_key text not null,
  page integer not null default 1,
  returned_count integer not null default 0,
  provider_total integer,
  unique_observations integer not null default 0,
  status integer,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, make, model, planned_sequence)
);

create index if not exists motor_match_market_fetches_run_idx
  on public.motor_match_market_fetches (run_id, make, model);

create table if not exists public.motor_match_market_observations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.motor_match_market_runs(id) on delete cascade,
  listing_key text not null,
  bucket_make text not null,
  bucket_model text not null,
  vin text,
  year integer,
  make text,
  model text,
  trim text,
  body_type text,
  drivetrain text,
  fuel_type text,
  price numeric,
  miles numeric,
  dealer text,
  city text,
  state text,
  zip text,
  latitude numeric,
  longitude numeric,
  listing_url text,
  provider_updated_at timestamptz,
  observed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (run_id, listing_key)
);

create index if not exists motor_match_market_observations_bucket_idx
  on public.motor_match_market_observations (bucket_make, bucket_model, year);

create index if not exists motor_match_market_observations_price_miles_idx
  on public.motor_match_market_observations (bucket_make, bucket_model, price, miles);

alter table public.motor_match_market_runs enable row level security;
alter table public.motor_match_market_fetches enable row level security;
alter table public.motor_match_market_observations enable row level security;

revoke all on public.motor_match_market_runs from anon, authenticated;
revoke all on public.motor_match_market_fetches from anon, authenticated;
revoke all on public.motor_match_market_observations from anon, authenticated;

grant all on public.motor_match_market_runs to service_role;
grant all on public.motor_match_market_fetches to service_role;
grant all on public.motor_match_market_observations to service_role;
