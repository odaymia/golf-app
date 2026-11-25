-- Let the app read league_members.plays (the "I'm playing" switch).
-- league_pro.sql allows reading only listed columns; watchers.sql now includes this too.
grant select (plays) on public.league_members to authenticated;
