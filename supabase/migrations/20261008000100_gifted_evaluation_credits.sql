-- Gifted evaluation credits for Lot Logic platform support.
-- These credits sit outside a dealership's included trial/monthly allowance
-- and persist until consumed.

alter table public.company_entitlements
  add column if not exists gifted_evaluations integer not null default 0
  check (gifted_evaluations >= 0);

create table if not exists public.company_evaluation_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null,
  subject_key text,
  granted_by uuid references auth.users(id) on delete set null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists company_evaluation_credit_ledger_company_created_idx
  on public.company_evaluation_credit_ledger(company_id, created_at desc);

create unique index if not exists company_evaluation_credit_ledger_consumed_subject_idx
  on public.company_evaluation_credit_ledger(company_id, subject_key)
  where delta < 0 and subject_key is not null;

alter table public.company_evaluation_credit_ledger enable row level security;

grant select on table public.company_evaluation_credit_ledger to authenticated;
grant all on table public.company_evaluation_credit_ledger to service_role;

drop policy if exists "company admins can view evaluation credit ledger"
  on public.company_evaluation_credit_ledger;

create policy "company admins can view evaluation credit ledger"
on public.company_evaluation_credit_ledger
for select
using (public.is_company_admin(company_id));

create or replace function public.gift_company_evaluation_credits(
  p_company_id uuid,
  p_amount integer,
  p_granted_by uuid default null,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount is null or p_amount <= 0 or p_amount > 10000 then
    raise exception 'Gift amount must be between 1 and 10000.';
  end if;

  insert into public.company_entitlements (
    company_id,
    plan_key,
    evaluations_per_month,
    seats_limit,
    gifted_evaluations
  )
  values (
    p_company_id,
    'starter',
    20,
    1,
    p_amount
  )
  on conflict (company_id) do update
  set gifted_evaluations =
        public.company_entitlements.gifted_evaluations + excluded.gifted_evaluations,
      updated_at = now()
  returning gifted_evaluations into v_balance;

  insert into public.company_evaluation_credit_ledger (
    company_id,
    delta,
    reason,
    granted_by,
    note,
    metadata
  )
  values (
    p_company_id,
    p_amount,
    'admin_gift',
    p_granted_by,
    nullif(trim(coalesce(p_note, '')), ''),
    jsonb_build_object('balance_after', v_balance)
  );

  return v_balance;
end;
$$;

create or replace function public.consume_company_evaluation_credit(
  p_company_id uuid,
  p_subject_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_subject text := nullif(trim(coalesce(p_subject_key, '')), '');
begin
  if v_subject is null then
    raise exception 'Evaluation subject key is required.';
  end if;

  if exists (
    select 1
    from public.company_evaluation_credit_ledger
    where company_id = p_company_id
      and subject_key = v_subject
      and delta < 0
  ) then
    return true;
  end if;

  select gifted_evaluations
  into v_balance
  from public.company_entitlements
  where company_id = p_company_id
  for update;

  if coalesce(v_balance, 0) <= 0 then
    return false;
  end if;

  update public.company_entitlements
  set gifted_evaluations = gifted_evaluations - 1,
      updated_at = now()
  where company_id = p_company_id;

  insert into public.company_evaluation_credit_ledger (
    company_id,
    delta,
    reason,
    subject_key,
    metadata
  )
  values (
    p_company_id,
    -1,
    'evaluation_consumed',
    v_subject,
    jsonb_build_object('balance_after', v_balance - 1)
  );

  return true;
end;
$$;

revoke all on function public.gift_company_evaluation_credits(uuid, integer, uuid, text) from public;
revoke all on function public.consume_company_evaluation_credit(uuid, text) from public;

grant execute on function public.gift_company_evaluation_credits(uuid, integer, uuid, text)
  to service_role;
grant execute on function public.consume_company_evaluation_credit(uuid, text)
  to service_role;
