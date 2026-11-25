-- Make every member findable: anyone with a name gets a public profile row
-- (display name only; username stays empty until they pick one in the
-- social tab), so search, "add player" and "+ Add Scribble members" find
-- people who signed up only to play golf.
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.
-- Needs schema.sql and social.sql.

-- Fill in everyone who has a name now.
insert into public.public_profiles (id, display_name)
select p.id, p.name
from public.profiles p
where coalesce(trim(p.name), '') <> ''
on conflict (id) do update
  set display_name = excluded.display_name
  where public.public_profiles.display_name = '';

-- And keep it that way: a new or renamed golf profile fills the public
-- display name when it's still empty (a name picked in the social tab wins).
create or replace function public.sync_public_profile_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(new.name), '') <> '' then
    insert into public_profiles (id, display_name) values (new.id, new.name)
    on conflict (id) do update
      set display_name = excluded.display_name
      where public_profiles.display_name = '';
  end if;
  return new;
exception when others then
  return new; -- never block saving a profile
end;
$$;
drop trigger if exists profiles_sync_public_name on public.profiles;
create trigger profiles_sync_public_name after insert or update of name on public.profiles
  for each row execute function public.sync_public_profile_name();
