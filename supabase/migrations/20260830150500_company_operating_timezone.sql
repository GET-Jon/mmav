alter table public.companies
  add column if not exists timezone text not null default 'America/New_York';

comment on column public.companies.timezone is
  'IANA operating timezone used for scheduling wall-clock times, for example America/New_York.';
