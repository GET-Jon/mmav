-- Lot Logic Inventory Operations — canonical database types
-- Phase 1 foundation only. No core Lot Logic behavior is modified here.

create type public.mindful_inventory_vehicle_phase as enum (
  'purchased',
  'intake',
  'inspection',
  'planning',
  'reconditioning',
  'final_qc',
  'merchandising',
  'ready'
);

create type public.mindful_inventory_vehicle_grade as enum (
  'a', 'b', 'c', 'd', 'e'
);

create type public.mindful_inventory_vehicle_priority as enum (
  '1', '2', '3'
);

create type public.mindful_inventory_vehicle_health as enum (
  'on_track',
  'at_risk',
  'behind',
  'blocked'
);

create type public.mindful_inventory_partner_scheduling_mode as enum (
  'manager_scheduled',
  'partner_availability',
  'partner_self_scheduling'
);

create type public.mindful_inventory_finding_severity as enum (
  'green',
  'yellow',
  'red'
);

create type public.mindful_inventory_finding_source as enum (
  'intake',
  'inspection',
  'ai',
  'partner',
  'manager',
  'qc',
  'other'
);

create type public.mindful_inventory_plan_status as enum (
  'draft',
  'approved',
  'superseded'
);

create type public.mindful_inventory_plan_item_classification as enum (
  'required',
  'recommended',
  'optional',
  'upgrade',
  'investigate'
);

create type public.mindful_inventory_plan_item_decision as enum (
  'approved',
  'declined',
  'investigate',
  'monitor'
);

create type public.mindful_inventory_plan_change_request_status as enum (
  'pending',
  'approved',
  'modified',
  'declined',
  'cancelled'
);

create type public.mindful_inventory_work_order_status as enum (
  'planned',
  'ready_to_schedule',
  'scheduled',
  'in_progress',
  'blocked',
  'complete',
  'cancelled'
);

create type public.mindful_inventory_transport_status as enum (
  'requested',
  'booked',
  'awaiting_pickup',
  'in_transit',
  'delayed',
  'delivered',
  'cancelled'
);

create type public.mindful_inventory_qc_outcome as enum (
  'pass',
  'fail',
  'manager_override'
);

create type public.mindful_inventory_work_difficulty as enum (
  'easy',
  'normal',
  'hard'
);
