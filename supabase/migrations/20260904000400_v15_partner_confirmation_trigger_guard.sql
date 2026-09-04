-- Keep initial partner assignment awaiting confirmation without interfering with a later real partner confirmation.

create or replace function public.require_external_partner_confirmation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.assigned_partner_id is null or new.partner_confirmation_status <> 'confirmed' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.partner_confirmation_status := 'awaiting_partner';
    return new;
  end if;

  if old.assigned_partner_id is distinct from new.assigned_partner_id
     or old.partner_confirmation_status is null then
    new.partner_confirmation_status := 'awaiting_partner';
  end if;

  return new;
end;
$$;
