-- Track the economic value of Mindful internal labor separately from partner/vendor cost.

alter table public.mindful_inventory_work_orders
  add column if not exists internal_labor_value numeric(12,2)
  check (internal_labor_value is null or internal_labor_value >= 0);

comment on column public.mindful_inventory_work_orders.internal_labor_value is
  'Managerial value attributed to internal Mindful labor. This is not vendor cash cost and contributes to projected vehicle value.';
