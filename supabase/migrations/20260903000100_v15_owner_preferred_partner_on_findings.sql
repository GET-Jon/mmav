alter table public.mindful_inventory_findings
  add column if not exists owner_preferred_partner_id uuid null references public.mindful_inventory_partners(id) on delete set null;

create index if not exists idx_mindful_inventory_findings_owner_preferred_partner
  on public.mindful_inventory_findings(owner_preferred_partner_id)
  where owner_preferred_partner_id is not null;
