alter table public.mindful_inventory_partner_capabilities
  add column if not exists source text not null default 'admin',
  add column if not exists created_by_partner_id uuid null references public.mindful_inventory_partners(id) on delete set null;

alter table public.mindful_inventory_partner_capabilities
  drop constraint if exists mindful_inventory_partner_capabilities_source_check;

alter table public.mindful_inventory_partner_capabilities
  add constraint mindful_inventory_partner_capabilities_source_check
  check (source in ('admin','partner'));

create index if not exists mindful_inventory_partner_capabilities_created_by_partner_id_idx
  on public.mindful_inventory_partner_capabilities(created_by_partner_id);
