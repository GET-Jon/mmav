-- Lot Logic Inventory Operations — RLS and access foundation.
-- Internal company members use tenant-scoped base tables.
-- Partners do not receive direct access to financially sensitive vehicle/work tables.

create or replace function public.mindful_inventory_partner_id(
  check_company_id uuid,
  check_user_id uuid default auth.uid()
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select partner.id
  from public.mindful_inventory_partners partner
  where partner.company_id = check_company_id
    and partner.user_id = check_user_id
    and partner.active = true
  limit 1;
$$;

create or replace function public.mindful_inventory_partner_has_permission(
  check_company_id uuid,
  permission_code text,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    case permission_code
      when 'view_assigned_work' then permissions.view_assigned_work
      when 'start_work' then permissions.start_work
      when 'complete_work' then permissions.complete_work
      when 'upload_media' then permissions.upload_media
      when 'add_notes' then permissions.add_notes
      when 'report_blocker' then permissions.report_blocker
      when 'update_parts' then permissions.update_parts
      when 'update_actual_cost' then permissions.update_actual_cost
      when 'submit_invoice' then permissions.submit_invoice
      when 'reschedule_work' then permissions.reschedule_work
      when 'add_finding' then permissions.add_finding
      when 'propose_additional_work' then permissions.propose_additional_work
      when 'request_plan_change' then permissions.request_plan_change
      when 'edit_estimate' then permissions.edit_estimate
      else false
    end,
    false
  )
  from public.mindful_inventory_partners partner
  join public.mindful_inventory_partner_permissions permissions
    on permissions.partner_id = partner.id
  where partner.company_id = check_company_id
    and partner.user_id = check_user_id
    and partner.active = true
  limit 1;
$$;

-- Explicit grants are paired with RLS. Partner users are authenticated too,
-- so policies, not grants alone, define which rows they may reach.
grant select, insert, update, delete on table
  public.mindful_inventory_locations,
  public.mindful_inventory_resources,
  public.mindful_inventory_partners,
  public.mindful_inventory_partner_capabilities,
  public.mindful_inventory_partner_capability_assignments,
  public.mindful_inventory_partner_permissions,
  public.mindful_inventory_partner_locations,
  public.mindful_inventory_partner_availability,
  public.mindful_inventory_vehicles,
  public.mindful_inventory_intakes,
  public.mindful_inventory_inspections,
  public.mindful_inventory_findings,
  public.mindful_inventory_car_plans,
  public.mindful_inventory_car_plan_versions,
  public.mindful_inventory_plan_items,
  public.mindful_inventory_plan_change_requests,
  public.mindful_inventory_work_orders,
  public.mindful_inventory_work_dependencies,
  public.mindful_inventory_work_completion_requirements,
  public.mindful_inventory_work_order_parts,
  public.mindful_inventory_vehicle_movements,
  public.mindful_inventory_transportation,
  public.mindful_inventory_attachments,
  public.mindful_inventory_qc_inspections,
  public.mindful_inventory_qc_items
  to authenticated;

grant select, insert on table public.mindful_inventory_history to authenticated;

-- Locations
create policy "inventory members manage locations"
on public.mindful_inventory_locations
for all
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

-- Resources derive tenant access from Location.
create policy "inventory members manage resources"
on public.mindful_inventory_resources
for all
using (
  exists (
    select 1 from public.mindful_inventory_locations location
    where location.id = location_id
      and public.is_company_member(location.company_id)
  )
)
with check (
  exists (
    select 1 from public.mindful_inventory_locations location
    where location.id = location_id
      and public.is_company_member(location.company_id)
  )
);

-- Partners: internal members manage; authenticated partners may view only themselves.
create policy "inventory members manage partners"
on public.mindful_inventory_partners
for all
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

create policy "inventory partners view own profile"
on public.mindful_inventory_partners
for select
using (user_id = auth.uid() and active = true);

create policy "inventory members manage partner capabilities"
on public.mindful_inventory_partner_capabilities
for all
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

create policy "inventory members manage partner capability assignments"
on public.mindful_inventory_partner_capability_assignments
for all
using (
  exists (
    select 1 from public.mindful_inventory_partners partner
    where partner.id = partner_id
      and public.is_company_member(partner.company_id)
  )
)
with check (
  exists (
    select 1 from public.mindful_inventory_partners partner
    where partner.id = partner_id
      and public.is_company_member(partner.company_id)
  )
);

create policy "inventory partners view own capability assignments"
on public.mindful_inventory_partner_capability_assignments
for select
using (
  exists (
    select 1 from public.mindful_inventory_partners partner
    where partner.id = partner_id
      and partner.user_id = auth.uid()
      and partner.active = true
  )
);

create policy "inventory members manage partner permissions"
on public.mindful_inventory_partner_permissions
for all
using (
  exists (
    select 1 from public.mindful_inventory_partners partner
    where partner.id = partner_id
      and public.is_company_member(partner.company_id)
  )
)
with check (
  exists (
    select 1 from public.mindful_inventory_partners partner
    where partner.id = partner_id
      and public.is_company_member(partner.company_id)
  )
);

create policy "inventory partners view own permissions"
on public.mindful_inventory_partner_permissions
for select
using (
  exists (
    select 1 from public.mindful_inventory_partners partner
    where partner.id = partner_id
      and partner.user_id = auth.uid()
      and partner.active = true
  )
);

create policy "inventory members manage partner locations"
on public.mindful_inventory_partner_locations
for all
using (
  exists (
    select 1 from public.mindful_inventory_partners partner
    where partner.id = partner_id
      and public.is_company_member(partner.company_id)
  )
)
with check (
  exists (
    select 1 from public.mindful_inventory_partners partner
    where partner.id = partner_id
      and public.is_company_member(partner.company_id)
  )
);

create policy "inventory partners view own locations"
on public.mindful_inventory_partner_locations
for select
using (
  exists (
    select 1 from public.mindful_inventory_partners partner
    where partner.id = partner_id
      and partner.user_id = auth.uid()
      and partner.active = true
  )
);

create policy "inventory members manage partner availability"
on public.mindful_inventory_partner_availability
for all
using (
  exists (
    select 1 from public.mindful_inventory_partners partner
    where partner.id = partner_id
      and public.is_company_member(partner.company_id)
  )
)
with check (
  exists (
    select 1 from public.mindful_inventory_partners partner
    where partner.id = partner_id
      and public.is_company_member(partner.company_id)
  )
);

create policy "inventory partners manage own availability"
on public.mindful_inventory_partner_availability
for all
using (
  exists (
    select 1 from public.mindful_inventory_partners partner
    where partner.id = partner_id
      and partner.user_id = auth.uid()
      and partner.active = true
  )
)
with check (
  exists (
    select 1 from public.mindful_inventory_partners partner
    where partner.id = partner_id
      and partner.user_id = auth.uid()
      and partner.active = true
  )
);

-- Vehicle root and all financially sensitive execution tables are internal-only.
create policy "inventory members manage vehicles"
on public.mindful_inventory_vehicles
for all
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

create policy "inventory members manage intakes"
on public.mindful_inventory_intakes
for all
using (
  exists (select 1 from public.mindful_inventory_vehicles vehicle where vehicle.id = vehicle_id and public.is_company_member(vehicle.company_id))
)
with check (
  exists (select 1 from public.mindful_inventory_vehicles vehicle where vehicle.id = vehicle_id and public.is_company_member(vehicle.company_id))
);

create policy "inventory members manage inspections"
on public.mindful_inventory_inspections
for all
using (
  exists (select 1 from public.mindful_inventory_vehicles vehicle where vehicle.id = vehicle_id and public.is_company_member(vehicle.company_id))
)
with check (
  exists (select 1 from public.mindful_inventory_vehicles vehicle where vehicle.id = vehicle_id and public.is_company_member(vehicle.company_id))
);

create policy "inventory members manage findings"
on public.mindful_inventory_findings
for all
using (
  exists (select 1 from public.mindful_inventory_vehicles vehicle where vehicle.id = vehicle_id and public.is_company_member(vehicle.company_id))
)
with check (
  exists (select 1 from public.mindful_inventory_vehicles vehicle where vehicle.id = vehicle_id and public.is_company_member(vehicle.company_id))
);

create policy "inventory members manage car plans"
on public.mindful_inventory_car_plans
for all
using (
  exists (select 1 from public.mindful_inventory_vehicles vehicle where vehicle.id = vehicle_id and public.is_company_member(vehicle.company_id))
)
with check (
  exists (select 1 from public.mindful_inventory_vehicles vehicle where vehicle.id = vehicle_id and public.is_company_member(vehicle.company_id))
);

create policy "inventory members manage car plan versions"
on public.mindful_inventory_car_plan_versions
for all
using (
  exists (
    select 1
    from public.mindful_inventory_car_plans plan
    join public.mindful_inventory_vehicles vehicle on vehicle.id = plan.vehicle_id
    where plan.id = car_plan_id and public.is_company_member(vehicle.company_id)
  )
)
with check (
  exists (
    select 1
    from public.mindful_inventory_car_plans plan
    join public.mindful_inventory_vehicles vehicle on vehicle.id = plan.vehicle_id
    where plan.id = car_plan_id and public.is_company_member(vehicle.company_id)
  )
);

create policy "inventory members manage plan items"
on public.mindful_inventory_plan_items
for all
using (
  exists (
    select 1
    from public.mindful_inventory_car_plan_versions version
    join public.mindful_inventory_car_plans plan on plan.id = version.car_plan_id
    join public.mindful_inventory_vehicles vehicle on vehicle.id = plan.vehicle_id
    where version.id = plan_version_id and public.is_company_member(vehicle.company_id)
  )
)
with check (
  exists (
    select 1
    from public.mindful_inventory_car_plan_versions version
    join public.mindful_inventory_car_plans plan on plan.id = version.car_plan_id
    join public.mindful_inventory_vehicles vehicle on vehicle.id = plan.vehicle_id
    where version.id = plan_version_id and public.is_company_member(vehicle.company_id)
  )
);

create policy "inventory members manage plan change requests"
on public.mindful_inventory_plan_change_requests
for all
using (
  exists (select 1 from public.mindful_inventory_vehicles vehicle where vehicle.id = vehicle_id and public.is_company_member(vehicle.company_id))
)
with check (
  exists (select 1 from public.mindful_inventory_vehicles vehicle where vehicle.id = vehicle_id and public.is_company_member(vehicle.company_id))
);

create policy "inventory members manage work orders"
on public.mindful_inventory_work_orders
for all
using (
  exists (select 1 from public.mindful_inventory_vehicles vehicle where vehicle.id = vehicle_id and public.is_company_member(vehicle.company_id))
)
with check (
  exists (select 1 from public.mindful_inventory_vehicles vehicle where vehicle.id = vehicle_id and public.is_company_member(vehicle.company_id))
);

create policy "inventory members manage work dependencies"
on public.mindful_inventory_work_dependencies
for all
using (
  exists (
    select 1 from public.mindful_inventory_work_orders work
    join public.mindful_inventory_vehicles vehicle on vehicle.id = work.vehicle_id
    where work.id = work_order_id and public.is_company_member(vehicle.company_id)
  )
)
with check (
  exists (
    select 1 from public.mindful_inventory_work_orders work
    join public.mindful_inventory_vehicles vehicle on vehicle.id = work.vehicle_id
    where work.id = work_order_id and public.is_company_member(vehicle.company_id)
  )
);

create policy "inventory members manage completion requirements"
on public.mindful_inventory_work_completion_requirements
for all
using (
  exists (
    select 1 from public.mindful_inventory_work_orders work
    join public.mindful_inventory_vehicles vehicle on vehicle.id = work.vehicle_id
    where work.id = work_order_id and public.is_company_member(vehicle.company_id)
  )
)
with check (
  exists (
    select 1 from public.mindful_inventory_work_orders work
    join public.mindful_inventory_vehicles vehicle on vehicle.id = work.vehicle_id
    where work.id = work_order_id and public.is_company_member(vehicle.company_id)
  )
);

create policy "inventory members manage work order parts"
on public.mindful_inventory_work_order_parts
for all
using (
  exists (
    select 1 from public.mindful_inventory_work_orders work
    join public.mindful_inventory_vehicles vehicle on vehicle.id = work.vehicle_id
    where work.id = work_order_id and public.is_company_member(vehicle.company_id)
  )
)
with check (
  exists (
    select 1 from public.mindful_inventory_work_orders work
    join public.mindful_inventory_vehicles vehicle on vehicle.id = work.vehicle_id
    where work.id = work_order_id and public.is_company_member(vehicle.company_id)
  )
);

create policy "inventory members manage vehicle movements"
on public.mindful_inventory_vehicle_movements
for all
using (
  exists (select 1 from public.mindful_inventory_vehicles vehicle where vehicle.id = vehicle_id and public.is_company_member(vehicle.company_id))
)
with check (
  exists (select 1 from public.mindful_inventory_vehicles vehicle where vehicle.id = vehicle_id and public.is_company_member(vehicle.company_id))
);

create policy "inventory members manage transportation"
on public.mindful_inventory_transportation
for all
using (
  exists (select 1 from public.mindful_inventory_vehicles vehicle where vehicle.id = vehicle_id and public.is_company_member(vehicle.company_id))
)
with check (
  exists (select 1 from public.mindful_inventory_vehicles vehicle where vehicle.id = vehicle_id and public.is_company_member(vehicle.company_id))
);

create policy "inventory members manage attachments"
on public.mindful_inventory_attachments
for all
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

create policy "inventory members manage qc inspections"
on public.mindful_inventory_qc_inspections
for all
using (
  exists (select 1 from public.mindful_inventory_vehicles vehicle where vehicle.id = vehicle_id and public.is_company_member(vehicle.company_id))
)
with check (
  exists (select 1 from public.mindful_inventory_vehicles vehicle where vehicle.id = vehicle_id and public.is_company_member(vehicle.company_id))
);

create policy "inventory members manage qc items"
on public.mindful_inventory_qc_items
for all
using (
  exists (
    select 1 from public.mindful_inventory_qc_inspections qc
    join public.mindful_inventory_vehicles vehicle on vehicle.id = qc.vehicle_id
    where qc.id = qc_inspection_id and public.is_company_member(vehicle.company_id)
  )
)
with check (
  exists (
    select 1 from public.mindful_inventory_qc_inspections qc
    join public.mindful_inventory_vehicles vehicle on vehicle.id = qc.vehicle_id
    where qc.id = qc_inspection_id and public.is_company_member(vehicle.company_id)
  )
);

create policy "inventory members view history"
on public.mindful_inventory_history
for select
using (public.is_company_member(company_id));

create policy "inventory members append history"
on public.mindful_inventory_history
for insert
with check (public.is_company_member(company_id));

-- Sanitized partner read model. No acquisition economics, expected retail,
-- projected gross, total recon, or other-partner financial information is returned.
create or replace function public.get_my_inventory_assigned_work()
returns table (
  work_order_id uuid,
  vehicle_id uuid,
  vehicle_label text,
  vin text,
  mileage integer,
  work_title text,
  work_description text,
  category text,
  subcategory text,
  status public.mindful_inventory_work_order_status,
  approved_work_budget numeric,
  location_name text,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  due_at timestamptz,
  blocker_reason text,
  next_action text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    work.id,
    vehicle.id,
    concat_ws(' ', vehicle.year::text, vehicle.make, vehicle.model, vehicle.trim),
    vehicle.vin,
    vehicle.mileage,
    work.title,
    work.description,
    work.category,
    work.subcategory,
    work.status,
    work.approved_budget,
    location.name,
    work.scheduled_start_at,
    work.scheduled_end_at,
    work.due_at,
    work.blocker_reason,
    vehicle.next_action
  from public.mindful_inventory_work_orders work
  join public.mindful_inventory_vehicles vehicle on vehicle.id = work.vehicle_id
  join public.mindful_inventory_partners partner on partner.id = work.assigned_partner_id
  left join public.mindful_inventory_locations location on location.id = work.location_id
  join public.mindful_inventory_partner_permissions permissions on permissions.partner_id = partner.id
  where partner.user_id = auth.uid()
    and partner.active = true
    and permissions.view_assigned_work = true
    and work.status <> 'cancelled';
$$;

revoke all on function public.get_my_inventory_assigned_work() from public;
grant execute on function public.get_my_inventory_assigned_work() to authenticated;

revoke all on function public.mindful_inventory_partner_id(uuid, uuid) from public;
grant execute on function public.mindful_inventory_partner_id(uuid, uuid) to authenticated, service_role;

revoke all on function public.mindful_inventory_partner_has_permission(uuid, text, uuid) from public;
grant execute on function public.mindful_inventory_partner_has_permission(uuid, text, uuid) to authenticated, service_role;
