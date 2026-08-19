-- Lot Logic Inventory Operations — Attachments/Media and Final QC.
-- Attachments are entity-specific; Final QC is a mandatory management gate.

create table public.mindful_inventory_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  vehicle_id uuid not null references public.mindful_inventory_vehicles(id) on delete cascade,
  entity_type text not null check (
    entity_type in ('vehicle', 'intake', 'inspection', 'finding', 'plan_item', 'work_order', 'part', 'transportation', 'qc', 'invoice', 'other')
  ),
  entity_id uuid not null,
  attachment_type text not null default 'document' check (
    attachment_type in ('photo', 'before_photo', 'after_photo', 'diagnostic_image', 'receipt', 'invoice', 'document', 'other')
  ),
  storage_bucket text not null,
  storage_path text not null,
  original_filename text,
  mime_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  uploaded_by_user_id uuid references auth.users(id) on delete set null,
  uploaded_by_partner_id uuid references public.mindful_inventory_partners(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    uploaded_by_user_id is null
    or uploaded_by_partner_id is null
  )
);

create index mindful_inventory_attachments_vehicle_created_idx
  on public.mindful_inventory_attachments(vehicle_id, created_at desc);

create index mindful_inventory_attachments_entity_idx
  on public.mindful_inventory_attachments(entity_type, entity_id, created_at);

create unique index mindful_inventory_attachments_storage_unique_idx
  on public.mindful_inventory_attachments(storage_bucket, storage_path);

create table public.mindful_inventory_qc_inspections (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.mindful_inventory_vehicles(id) on delete cascade,
  performed_by_user_id uuid not null references auth.users(id) on delete restrict,
  outcome public.mindful_inventory_qc_outcome,
  summary text,
  override_reason text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    outcome is null
    or completed_at is not null
  ),
  check (
    outcome <> 'manager_override'
    or nullif(trim(override_reason), '') is not null
  )
);

create index mindful_inventory_qc_inspections_vehicle_created_idx
  on public.mindful_inventory_qc_inspections(vehicle_id, created_at desc);

create index mindful_inventory_qc_inspections_vehicle_outcome_idx
  on public.mindful_inventory_qc_inspections(vehicle_id, outcome)
  where outcome is not null;

create table public.mindful_inventory_qc_items (
  id uuid primary key default gen_random_uuid(),
  qc_inspection_id uuid not null references public.mindful_inventory_qc_inspections(id) on delete cascade,
  category text not null,
  label text not null,
  result text check (result is null or result in ('pass', 'fail', 'not_applicable')),
  notes text,
  sequence_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mindful_inventory_qc_items_qc_idx
  on public.mindful_inventory_qc_items(qc_inspection_id, sequence_order);

alter table public.mindful_inventory_attachments enable row level security;
alter table public.mindful_inventory_qc_inspections enable row level security;
alter table public.mindful_inventory_qc_items enable row level security;
