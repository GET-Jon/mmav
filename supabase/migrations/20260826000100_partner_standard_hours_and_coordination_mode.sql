alter type public.mindful_inventory_partner_scheduling_mode add value if not exists 'coordination_required';

alter table public.mindful_inventory_partners
  add column if not exists standard_hours jsonb not null default '{"mon":{"enabled":true,"start":"09:00","end":"17:00"},"tue":{"enabled":true,"start":"09:00","end":"17:00"},"wed":{"enabled":true,"start":"09:00","end":"17:00"},"thu":{"enabled":true,"start":"09:00","end":"17:00"},"fri":{"enabled":true,"start":"09:00","end":"17:00"},"sat":{"enabled":false,"start":"09:00","end":"17:00"},"sun":{"enabled":false,"start":"09:00","end":"17:00"}}'::jsonb;
