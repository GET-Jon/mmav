alter table public.mindful_inventory_partners
  add column if not exists mechanical_inspection_eligible boolean not null default false,
  add column if not exists default_inspection_fee numeric(12,2),
  add column if not exists typical_inspection_duration_hours numeric(8,2);

alter table public.mindful_inventory_inspections
  add column if not exists requested_start_at timestamptz,
  add column if not exists scheduled_start_at timestamptz,
  add column if not exists scheduled_end_at timestamptz,
  add column if not exists partner_confirmation_status text,
  add column if not exists inspection_fee numeric(12,2),
  add column if not exists submitted_at timestamptz,
  add column if not exists owner_review_status text,
  add column if not exists owner_reviewed_at timestamptz,
  add column if not exists owner_reviewed_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists revision_notes text;

alter table public.mindful_inventory_inspections drop constraint if exists mindful_inventory_inspections_status_check;
alter table public.mindful_inventory_inspections add constraint mindful_inventory_inspections_status_check
  check (status = any (array['draft'::text,'assigned'::text,'confirmed'::text,'in_progress'::text,'submitted'::text,'complete'::text,'revision_requested'::text,'cancelled'::text]));

alter table public.mindful_inventory_inspections drop constraint if exists mindful_inventory_inspections_partner_confirmation_status_check;
alter table public.mindful_inventory_inspections add constraint mindful_inventory_inspections_partner_confirmation_status_check
  check (partner_confirmation_status is null or partner_confirmation_status = any (array['pending'::text,'confirmed'::text,'adjusted'::text]));

alter table public.mindful_inventory_inspections drop constraint if exists mindful_inventory_inspections_owner_review_status_check;
alter table public.mindful_inventory_inspections add constraint mindful_inventory_inspections_owner_review_status_check
  check (owner_review_status is null or owner_review_status = any (array['pending'::text,'accepted'::text,'revision_requested'::text]));

create index if not exists mindful_inventory_inspections_partner_status_idx
  on public.mindful_inventory_inspections(performed_by_partner_id,status,scheduled_start_at);
