alter table public.mindful_inventory_upgrades
  rename column mechanical_suggested_parts to mechanical_part_suggestions;

notify pgrst, 'reload schema';
