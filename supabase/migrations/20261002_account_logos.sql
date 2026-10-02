-- Logos per connected calendar account (e.g. the Brainshed logo for
-- david@brainshed.ai), shown on that account's booking pages.
--
-- Files live in a PUBLIC storage bucket so booking pages can show them to
-- logged-out visitors. Only the app's server (service role) uploads, after
-- checking the account belongs to the signed-in user, so no storage RLS
-- policies are needed for writes.

alter table public.calendar_accounts
  add column if not exists logo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'account-logos',
  'account-logos',
  true,
  2097152, -- 2 MB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
