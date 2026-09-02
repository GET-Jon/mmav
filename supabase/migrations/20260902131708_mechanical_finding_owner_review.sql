alter table public.mindful_inventory_findings
  add column if not exists mechanical_owner_review_status text,
  add column if not exists mechanical_owner_review_notes text,
  add column if not exists mechanical_owner_reviewed_at timestamptz,
  add column if not exists mechanical_owner_reviewed_by_user_id uuid references auth.users(id) on delete set null;

alter table public.mindful_inventory_findings drop constraint if exists mindful_inventory_findings_mechanical_owner_review_status_check;
alter table public.mindful_inventory_findings add constraint mindful_inventory_findings_mechanical_owner_review_status_check
  check (mechanical_owner_review_status is null or mechanical_owner_review_status = any (array['accepted'::text,'dismissed'::text]));
