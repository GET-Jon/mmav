create or replace function public.infer_required_work_order_part(work_title text)
returns text
language plpgsql
immutable
as $$
declare
  cleaned text;
begin
  if work_title is null or btrim(work_title) = '' then
    return null;
  end if;

  cleaned := btrim(work_title);

  if cleaned ~* '^\s*(install|replace|add)\s+' then
    cleaned := regexp_replace(cleaned, '^\s*(install|replace|add)\s+', '', 'i');
  elsif cleaned ~* '^\s*upgrade\s+' then
    cleaned := regexp_replace(cleaned, '^\s*upgrade\s+', '', 'i');
  else
    return null;
  end if;

  cleaned := btrim(cleaned);
  if cleaned = '' then
    return null;
  end if;

  return cleaned;
end;
$$;

create or replace function public.ensure_required_part_for_work_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inferred_part text;
begin
  inferred_part := public.infer_required_work_order_part(new.title);
  if inferred_part is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.mindful_inventory_work_order_parts p
    where p.work_order_id = new.id
      and p.status <> 'cancelled'
      and lower(btrim(p.description)) = lower(btrim(inferred_part))
  ) then
    insert into public.mindful_inventory_work_order_parts (
      work_order_id,
      description,
      quantity,
      status,
      notes,
      created_by,
      updated_by
    ) values (
      new.id,
      inferred_part,
      1,
      'needed',
      'Lot Logic inferred this as a required Work Order dependency from the approved work scope. Resolve as in stock, purchased, partner supplied, customer supplied, or not required before execution.',
      new.created_by,
      new.updated_by
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_work_order_required_part_dependency on public.mindful_inventory_work_orders;
create trigger trg_work_order_required_part_dependency
after insert on public.mindful_inventory_work_orders
for each row
execute function public.ensure_required_part_for_work_order();
