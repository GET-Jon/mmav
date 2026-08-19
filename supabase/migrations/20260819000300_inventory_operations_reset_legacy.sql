-- Lot Logic Inventory Operations — retire the disposable prototype backend.
--
-- The pre-August Inventory data was test-only and is intentionally NOT migrated.
-- This migration removes only Inventory-owned prototype objects plus the intentional
-- Lot Logic -> Inventory purchase handoff function. Core Lot Logic tables are untouched.

DROP FUNCTION IF EXISTS public.purchase_evaluation_and_add_to_inventory(uuid, uuid, uuid);

DROP TABLE IF EXISTS public.mindful_inventory_activity;
DROP TABLE IF EXISTS public.mindful_inventory_work_items;
DROP TABLE IF EXISTS public.mindful_inventory_vehicles;
