#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

TEST_EMAIL="inventory-ui@local.test"
TEST_PASSWORD="InventoryTest123!"
LOCAL_AUTH_URL="http://127.0.0.1:54321"
DB_CONTAINER="supabase_db_mmav"

echo "=== LOCAL INVENTORY FIXTURES ==="
echo "This script only targets the local Supabase stack at 127.0.0.1:54321."

echo
echo "=== CHECK LOCAL SUPABASE ==="
if ! npx supabase status >/dev/null 2>&1; then
  echo "Local Supabase is not running. Start it with: npx supabase start" >&2
  exit 1
fi

SERVICE_ROLE_KEY="$(npx supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"/\1/p')"
if [[ -z "$SERVICE_ROLE_KEY" ]]; then
  echo "Could not read the local Supabase service-role key." >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  echo "Expected local database container $DB_CONTAINER is not running." >&2
  exit 1
fi

echo "Local Supabase is running."

echo
echo "=== ENSURE LOCAL TEST USER ==="
USER_COUNT="$(docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -Atqc "select count(*) from auth.users where lower(email)=lower('$TEST_EMAIL');")"

if [[ "$USER_COUNT" == "0" ]]; then
  curl -fsS \
    -X POST "$LOCAL_AUTH_URL/auth/v1/admin/users" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"email_confirm\":true}" \
    >/dev/null
  echo "Created $TEST_EMAIL"
else
  echo "$TEST_EMAIL already exists; leaving its password unchanged."
fi

echo
echo "=== SEED COMPANY MEMBERSHIP + INVENTORY ==="
docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
do $$
declare
  v_company_id uuid;
  v_user_id uuid;
  v_bmw uuid := '00000000-0000-4000-8000-000000000101';
  v_audi uuid := '00000000-0000-4000-8000-000000000102';
  v_volvo uuid := '00000000-0000-4000-8000-000000000103';
  v_mercedes uuid := '00000000-0000-4000-8000-000000000104';
  v_bmw_intake uuid := '00000000-0000-4000-8000-000000001101';
  v_audi_intake uuid := '00000000-0000-4000-8000-000000001102';
  v_volvo_intake uuid := '00000000-0000-4000-8000-000000001103';
  v_bmw_inspection uuid := '00000000-0000-4000-8000-000000001201';
  v_audi_inspection uuid := '00000000-0000-4000-8000-000000001202';
begin
  select id into v_company_id
  from public.companies
  where slug = 'mindful-motor-co'
  limit 1;

  if v_company_id is null then
    raise exception 'Mindful Motor Co. tenant is missing. Run migrations/reset first.';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower('inventory-ui@local.test')
  limit 1;

  if v_user_id is null then
    raise exception 'Local Inventory test user is missing.';
  end if;

  insert into public.company_memberships (
    company_id,
    user_id,
    role,
    status
  ) values (
    v_company_id,
    v_user_id,
    'company_admin',
    'active'
  )
  on conflict (company_id, user_id) do update
    set role = 'company_admin',
        status = 'active',
        updated_at = now();

  insert into public.mindful_inventory_vehicles (
    id, company_id, stock_number, year, make, model, trim, mileage,
    project_owner_user_id, phase, grade, priority, health,
    next_action, next_action_owner_user_id,
    purchase_date, purchase_price, buyer_fees, expected_sale_price,
    title_status, created_by, updated_by, source_snapshot
  ) values
    (
      v_bmw, v_company_id, 'MM-101', 2013, 'BMW', '328i', 'M Sport', 140000,
      v_user_id, 'purchased', 'c', '1', 'on_track',
      'Review Draft Car Plan', v_user_id,
      current_date - 5, 4500, 650, 9500,
      'received', v_user_id, v_user_id,
      '{"fixture":true,"purpose":"car_plan_test"}'::jsonb
    ),
    (
      v_audi, v_company_id, 'MM-102', 2006, 'Audi', 'A4', 'quattro', 151000,
      v_user_id, 'purchased', 'c', '2', 'at_risk',
      'Review mechanical inspection', v_user_id,
      current_date - 3, 1500, 475, 6500,
      'awaiting', v_user_id, v_user_id,
      '{"fixture":true,"purpose":"inspection_test"}'::jsonb
    ),
    (
      v_volvo, v_company_id, 'MM-103', 2017, 'Volvo', 'V60', 'T5', 98000,
      v_user_id, 'purchased', 'b', '2', 'on_track',
      'Complete mechanical inspection', v_user_id,
      current_date - 2, 7200, 600, 12500,
      'received', v_user_id, v_user_id,
      '{"fixture":true,"purpose":"intake_test"}'::jsonb
    ),
    (
      v_mercedes, v_company_id, 'MM-104', 2015, 'Mercedes-Benz', 'C300', '4MATIC', 112000,
      v_user_id, 'purchased', null, '3', 'on_track',
      'Complete purchaser intake', v_user_id,
      current_date - 1, 6000, 550, 11000,
      'unknown', v_user_id, v_user_id,
      '{"fixture":true,"purpose":"purchased_test"}'::jsonb
    )
  on conflict (id) do update set
    company_id = excluded.company_id,
    stock_number = excluded.stock_number,
    year = excluded.year,
    make = excluded.make,
    model = excluded.model,
    trim = excluded.trim,
    mileage = excluded.mileage,
    project_owner_user_id = excluded.project_owner_user_id,
    grade = excluded.grade,
    priority = excluded.priority,
    health = excluded.health,
    next_action = excluded.next_action,
    next_action_owner_user_id = excluded.next_action_owner_user_id,
    purchase_date = excluded.purchase_date,
    purchase_price = excluded.purchase_price,
    buyer_fees = excluded.buyer_fees,
    expected_sale_price = excluded.expected_sale_price,
    title_status = excluded.title_status,
    updated_by = excluded.updated_by,
    source_snapshot = excluded.source_snapshot,
    updated_at = now();

  insert into public.mindful_inventory_intakes (
    id, vehicle_id, performed_by_user_id, status, started_at, completed_at,
    mileage, keys_count, visible_damage_summary, initial_observations,
    preliminary_grade
  ) values
    (
      v_bmw_intake, v_bmw, v_user_id, 'complete', now() - interval '4 days', now() - interval '4 days' + interval '25 minutes',
      140012, 2, 'Minor front bumper scuffs and driver bolster wear.',
      'Vehicle starts and drives. No warning lights observed during purchaser intake.', 'c'
    ),
    (
      v_audi_intake, v_audi, v_user_id, 'complete', now() - interval '2 days', now() - interval '2 days' + interval '20 minutes',
      151020, 1, 'Paint wear, small rear bumper marks, wheel rash.',
      'Quattro vehicle acquired as a rally-style build candidate.', 'c'
    ),
    (
      v_volvo_intake, v_volvo, v_user_id, 'complete', now() - interval '1 day', now() - interval '1 day' + interval '18 minutes',
      98014, 2, 'Light cosmetic wear consistent with mileage.',
      'Purchaser intake complete; ready for mechanical inspection.', 'b'
    )
  on conflict (id) do update set
    performed_by_user_id = excluded.performed_by_user_id,
    status = excluded.status,
    started_at = excluded.started_at,
    completed_at = excluded.completed_at,
    mileage = excluded.mileage,
    keys_count = excluded.keys_count,
    visible_damage_summary = excluded.visible_damage_summary,
    initial_observations = excluded.initial_observations,
    preliminary_grade = excluded.preliminary_grade,
    updated_at = now();

  insert into public.mindful_inventory_inspections (
    id, vehicle_id, inspection_type, performed_by_user_id, status,
    started_at, completed_at, summary
  ) values
    (
      v_bmw_inspection, v_bmw, 'mechanical', v_user_id, 'complete',
      now() - interval '3 days', now() - interval '3 days' + interval '50 minutes',
      'Overall mechanically serviceable. Oil seepage and front brake wear should be addressed in planning.'
    ),
    (
      v_audi_inspection, v_audi, 'mechanical', v_user_id, 'in_progress',
      now() - interval '6 hours', null,
      'Inspection underway. Suspension and fluid service require closer review.'
    )
  on conflict (id) do update set
    performed_by_user_id = excluded.performed_by_user_id,
    status = excluded.status,
    started_at = excluded.started_at,
    completed_at = excluded.completed_at,
    summary = excluded.summary,
    updated_at = now();

  insert into public.mindful_inventory_findings (
    id, vehicle_id, inspection_id, source, source_user_id,
    title, description, category, severity, confidence, certainty,
    estimated_cost_low, estimated_cost_high, estimated_duration_hours, status
  ) values
    (
      '00000000-0000-4000-8000-000000001301', v_bmw, v_bmw_inspection, 'inspection', v_user_id,
      'Front brake wear', 'Front pads are near replacement threshold; inspect rotors when disassembled.',
      'mechanical', 'yellow', 'high', 'observed', 300, 650, 2.0, 'open'
    ),
    (
      '00000000-0000-4000-8000-000000001302', v_bmw, v_bmw_inspection, 'inspection', v_user_id,
      'Oil seepage', 'Oil residue visible around the valve cover area. Confirm exact source before authorizing repair.',
      'mechanical', 'yellow', 'medium', 'suspected', 250, 900, 2.5, 'open'
    ),
    (
      '00000000-0000-4000-8000-000000001303', v_bmw, null, 'intake', v_user_id,
      'Driver bolster wear', 'Visible wear on the driver seat bolster; cosmetic improvement may help merchandising.',
      'cosmetic', 'green', 'high', 'observed', 100, 350, 1.0, 'open'
    )
  on conflict (id) do update set
    inspection_id = excluded.inspection_id,
    source_user_id = excluded.source_user_id,
    title = excluded.title,
    description = excluded.description,
    category = excluded.category,
    severity = excluded.severity,
    confidence = excluded.confidence,
    certainty = excluded.certainty,
    estimated_cost_low = excluded.estimated_cost_low,
    estimated_cost_high = excluded.estimated_cost_high,
    estimated_duration_hours = excluded.estimated_duration_hours,
    status = excluded.status,
    resolved_at = null,
    updated_at = now();

  -- Move vehicles through phases only after their prerequisite records exist.
  update public.mindful_inventory_vehicles
  set phase = 'planning',
      next_action = 'Review Draft Car Plan',
      updated_by = v_user_id,
      updated_at = now()
  where id = v_bmw;

  update public.mindful_inventory_vehicles
  set phase = 'inspection',
      next_action = 'Complete mechanical inspection',
      updated_by = v_user_id,
      updated_at = now()
  where id = v_audi;

  update public.mindful_inventory_vehicles
  set phase = 'inspection',
      next_action = 'Complete mechanical inspection',
      updated_by = v_user_id,
      updated_at = now()
  where id = v_volvo;

  update public.mindful_inventory_vehicles
  set phase = 'purchased',
      next_action = 'Complete purchaser intake',
      updated_by = v_user_id,
      updated_at = now()
  where id = v_mercedes;
end $$;
SQL

echo
echo "=== VERIFY FIXTURES ==="
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres <<'SQL'
select
  stock_number,
  year,
  make,
  model,
  phase,
  grade,
  priority,
  health,
  next_action
from public.mindful_inventory_vehicles
where source_snapshot ->> 'fixture' = 'true'
order by stock_number;

select
  v.stock_number,
  count(*) filter (where f.status = 'open') as open_findings
from public.mindful_inventory_vehicles v
left join public.mindful_inventory_findings f on f.vehicle_id = v.id
where v.source_snapshot ->> 'fixture' = 'true'
group by v.stock_number
order by v.stock_number;
SQL

echo
echo "Fixtures ready."
echo "Login: $TEST_EMAIL"
echo "Password after a fresh reset/create: $TEST_PASSWORD"
echo "MM-101 is the Car Plan test vehicle: completed Intake + completed Mechanical Inspection + 3 open Findings."
