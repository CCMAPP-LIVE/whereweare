-- MeYouWhen waiting list (signups from the meyouwhen.com home page).
-- RLS on with no policies: only the app's server (service role) reads/writes.
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  use_case text,
  created_at timestamptz not null default now()
);
create unique index if not exists waitlist_email_key on public.waitlist (lower(email));
alter table public.waitlist enable row level security;
