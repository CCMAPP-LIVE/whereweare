-- Booking links ("pick a time" pages) and the bookings made through them.
-- Run once in the Supabase SQL editor (project gvmxwywuukzptvnttnzv).
--
-- A booking link belongs to one app user and sends invites FROM one of that
-- user's connected Google accounts (calendar_account_id), e.g. brainshed or
-- dmsco. Public visitors never read these tables directly: the public /book
-- page and API use the service-role client and expose only free slot times.

create table if not exists public.booking_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_account_id uuid not null references public.calendar_accounts(id) on delete cascade,
  slug text not null unique
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  title text not null,
  description text,
  host_name text,
  duration_min integer not null default 30 check (duration_min between 10 and 240),
  weekdays integer[] not null default '{0,1,2,3,4}', -- 0=Mon .. 6=Sun
  day_start time not null default '09:00',
  day_end time not null default '17:00',
  min_notice_hours integer not null default 24 check (min_notice_hours between 0 and 720),
  max_days_ahead integer not null default 28 check (max_days_ahead between 1 and 180),
  buffer_min integer not null default 10 check (buffer_min between 0 and 120),
  add_meet boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.booking_links(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  guest_name text not null,
  guest_email text not null,
  notes text,
  google_event_id text,
  meet_url text,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now()
);

-- 2026-10-02: meeting length can also be "half day" (morning or afternoon of
-- the link's hours) or "full day" (the whole window) instead of N minutes.
alter table public.booking_links
  add column if not exists length_kind text not null default 'minutes'
  check (length_kind in ('minutes', 'half_day', 'full_day'));

-- Two people racing for the same slot on the same link: only one wins.
create unique index if not exists bookings_one_per_slot
  on public.bookings (link_id, start_at)
  where status = 'confirmed';

create index if not exists bookings_link_start on public.bookings (link_id, start_at);

alter table public.booking_links enable row level security;
alter table public.bookings enable row level security;

drop policy if exists "owner manages own booking links" on public.booking_links;
create policy "owner manages own booking links" on public.booking_links
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "owner reads own bookings" on public.bookings;
create policy "owner reads own bookings" on public.bookings
  for select using (
    exists (
      select 1 from public.booking_links l
      where l.id = bookings.link_id and l.user_id = auth.uid()
    )
  );

-- 2026-10-02: in-person meetings. Set by the link owner (the guest never
-- chooses); the address becomes the Google event's location. Can be combined
-- with add_meet for a hybrid meeting.
alter table public.booking_links
  add column if not exists in_person boolean not null default false,
  add column if not exists location text;

-- 2026-10-02: in-person at the CLIENT's location. location_mode 'host' uses
-- booking_links.location; 'client' asks the guest for their address at booking
-- time (stored on the booking and used as the Google event location).
alter table public.booking_links
  add column if not exists location_mode text not null default 'host'
  check (location_mode in ('host', 'client'));
alter table public.bookings
  add column if not exists guest_location text;
