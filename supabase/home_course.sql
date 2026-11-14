-- Home course from the course database (so it links to the course page).
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.
alter table public.public_profiles add column if not exists home_course_key text;
alter table public.public_profiles add column if not exists home_course_place text;
