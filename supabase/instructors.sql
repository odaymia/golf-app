-- Instructors: profiles, subscription tiers, subscriptions, subscriber-only
-- posts (private "premium" storage), and swing reviews.
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.
-- Needs social.sql, account_safety.sql and saves_messages.sql first.
--
-- Payments are not live yet. Subscriptions today are 'comp' (free access an
-- instructor gives). Paid ones ('stripe') will only ever be written by the
-- Stripe webhook running server-side with the service role, never by the app.

-- ---------------------------------------------------------------------------
-- Instructor profile (one per member who teaches). verified is set by us in
-- the dashboard after checking credentials; members can't set it.
create table if not exists public.instructor_profiles (
  user_id uuid primary key references public.public_profiles (id) on delete cascade,
  headline text not null default '' check (length(headline) <= 120),
  credentials text not null default '' check (length(credentials) <= 300),
  specialties text[] not null default '{}',
  lesson_info text not null default '' check (length(lesson_info) <= 1000),
  verified boolean not null default false,
  active boolean not null default true,
  stripe_account_id text,                -- set by the server when Stripe is connected
  created_at timestamptz not null default now()
);

-- What a subscriber gets. Prices in integer cents, per month.
create table if not exists public.instructor_tiers (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.instructor_profiles (user_id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  price_cents int not null check (price_cents between 100 and 50000),
  perks text not null default '' check (length(perks) <= 500),
  reviews_per_month int not null default 0 check (reviews_per_month between 0 and 31),
  position int not null default 0,
  active boolean not null default true,
  stripe_price_id text,                  -- set by the server
  created_at timestamptz not null default now()
);
create index if not exists instructor_tiers_idx on public.instructor_tiers (instructor_id, position);

create table if not exists public.instructor_subscriptions (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.instructor_profiles (user_id) on delete cascade,
  subscriber_id uuid not null references public.public_profiles (id) on delete cascade,
  tier_id uuid references public.instructor_tiers (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled')),
  source text not null default 'comp' check (source in ('comp', 'stripe')),
  current_period_end timestamptz,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  unique (instructor_id, subscriber_id),
  check (instructor_id <> subscriber_id)
);
create index if not exists instructor_subscriptions_sub_idx on public.instructor_subscriptions (subscriber_id);

-- "Notify me when subscriptions open" (and a demand signal for instructors).
create table if not exists public.subscription_interest (
  instructor_id uuid not null references public.instructor_profiles (user_id) on delete cascade,
  user_id uuid not null default auth.uid() references public.public_profiles (id) on delete cascade,
  tier_id uuid references public.instructor_tiers (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (instructor_id, user_id)
);

-- Posts can be for subscribers only; their media lives in the private bucket.
alter table public.posts add column if not exists audience text not null default 'public';
alter table public.posts drop constraint if exists posts_audience_check;
alter table public.posts add constraint posts_audience_check check (audience in ('public', 'subscribers'));
alter table public.post_media add column if not exists bucket text not null default 'media';
alter table public.post_media drop constraint if exists post_media_bucket_check;
alter table public.post_media add constraint post_media_bucket_check check (bucket in ('media', 'premium'));

-- Swing reviews: a subscriber sends a video, the instructor answers.
create table if not exists public.swing_reviews (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.instructor_profiles (user_id) on delete cascade,
  student_id uuid not null default auth.uid() references public.public_profiles (id) on delete cascade,
  video_path text not null,
  poster_path text,
  note text not null default '' check (length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'answered')),
  reply text not null default '' check (length(reply) <= 4000),
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists swing_reviews_instructor_idx on public.swing_reviews (instructor_id, status, created_at desc);
create index if not exists swing_reviews_student_idx on public.swing_reviews (student_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Access checks (security definer so policies can use them without recursion).

-- Am I an active subscriber of this instructor? (text id, for storage paths)
create or replace function public.has_premium_access(p_instructor text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from instructor_subscriptions s
    where s.instructor_id::text = p_instructor
      and s.subscriber_id = auth.uid()
      and s.status = 'active'
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

create or replace function public.is_instructor(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from instructor_profiles where user_id = p_user and active);
$$;

-- Swing reviews left this calendar month under my tier.
create or replace function public.reviews_left(p_instructor uuid) returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, coalesce((
    select t.reviews_per_month
    from instructor_subscriptions s join instructor_tiers t on t.id = s.tier_id
    where s.instructor_id = p_instructor and s.subscriber_id = auth.uid() and s.status = 'active'
      and (s.current_period_end is null or s.current_period_end > now())
  ), 0) - (
    select count(*)::int from swing_reviews r
    where r.instructor_id = p_instructor and r.student_id = auth.uid()
      and r.created_at >= date_trunc('month', now())
  ));
$$;

revoke all on function public.has_premium_access(text) from public, anon;
revoke all on function public.is_instructor(uuid) from public, anon;
revoke all on function public.reviews_left(uuid) from public, anon;
grant execute on function public.has_premium_access(text) to authenticated;
grant execute on function public.is_instructor(uuid) to authenticated;
grant execute on function public.reviews_left(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security.

alter table public.instructor_profiles enable row level security;
alter table public.instructor_tiers enable row level security;
alter table public.instructor_subscriptions enable row level security;
alter table public.subscription_interest enable row level security;
alter table public.swing_reviews enable row level security;

drop policy if exists "read instructors" on public.instructor_profiles;
drop policy if exists "own instructor insert" on public.instructor_profiles;
drop policy if exists "own instructor update" on public.instructor_profiles;
create policy "read instructors" on public.instructor_profiles for select to authenticated using (true);
create policy "own instructor insert" on public.instructor_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id and not verified and stripe_account_id is null);
create policy "own instructor update" on public.instructor_profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- Members may edit their own text fields only; verified/stripe are ours.
revoke update on public.instructor_profiles from authenticated;
grant select, insert on public.instructor_profiles to authenticated;
grant update (headline, credentials, specialties, lesson_info, active) on public.instructor_profiles to authenticated;

drop policy if exists "read tiers" on public.instructor_tiers;
drop policy if exists "own tiers write" on public.instructor_tiers;
create policy "read tiers" on public.instructor_tiers for select to authenticated using (true);
create policy "own tiers write" on public.instructor_tiers for all to authenticated
  using ((select auth.uid()) = instructor_id) with check ((select auth.uid()) = instructor_id and stripe_price_id is null);
grant select, insert, delete on public.instructor_tiers to authenticated;
grant update (name, price_cents, perks, reviews_per_month, position, active) on public.instructor_tiers to authenticated;

-- Subscribers see their own; instructors see theirs. Instructors may only
-- give or take away free ('comp') access; paid rows come from the server.
drop policy if exists "read own subscriptions" on public.instructor_subscriptions;
drop policy if exists "instructor gives comp" on public.instructor_subscriptions;
drop policy if exists "instructor updates comp" on public.instructor_subscriptions;
drop policy if exists "instructor removes comp" on public.instructor_subscriptions;
create policy "read own subscriptions" on public.instructor_subscriptions for select to authenticated
  using ((select auth.uid()) in (subscriber_id, instructor_id));
create policy "instructor gives comp" on public.instructor_subscriptions for insert to authenticated
  with check ((select auth.uid()) = instructor_id and source = 'comp' and stripe_subscription_id is null);
create policy "instructor updates comp" on public.instructor_subscriptions for update to authenticated
  using ((select auth.uid()) = instructor_id and source = 'comp')
  with check ((select auth.uid()) = instructor_id and source = 'comp');
create policy "instructor removes comp" on public.instructor_subscriptions for delete to authenticated
  using ((select auth.uid()) = instructor_id and source = 'comp');
grant select, insert, delete on public.instructor_subscriptions to authenticated;
grant update (tier_id, status) on public.instructor_subscriptions to authenticated;

drop policy if exists "own interest" on public.subscription_interest;
drop policy if exists "instructor reads interest" on public.subscription_interest;
create policy "own interest" on public.subscription_interest for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "instructor reads interest" on public.subscription_interest for select to authenticated
  using ((select auth.uid()) = instructor_id);
grant select, insert, delete on public.subscription_interest to authenticated;

drop policy if exists "review parties read" on public.swing_reviews;
drop policy if exists "subscriber requests review" on public.swing_reviews;
drop policy if exists "instructor answers" on public.swing_reviews;
drop policy if exists "student deletes open review" on public.swing_reviews;
create policy "review parties read" on public.swing_reviews for select to authenticated
  using ((select auth.uid()) in (student_id, instructor_id));
create policy "subscriber requests review" on public.swing_reviews for insert to authenticated
  with check ((select auth.uid()) = student_id and status = 'open' and reply = '' and public.reviews_left(instructor_id) > 0);
create policy "instructor answers" on public.swing_reviews for update to authenticated
  using ((select auth.uid()) = instructor_id) with check ((select auth.uid()) = instructor_id);
create policy "student deletes open review" on public.swing_reviews for delete to authenticated
  using ((select auth.uid()) = student_id and status = 'open');
grant select, insert, delete on public.swing_reviews to authenticated;
grant update (status, reply, answered_at) on public.swing_reviews to authenticated;

-- Subscriber-only posts: only instructors may post them, and their media
-- rows are visible only to the author and active subscribers.
drop policy if exists "own posts insert" on public.posts;
create policy "own posts insert" on public.posts for insert to authenticated
  with check ((select auth.uid()) = user_id and (audience = 'public' or public.is_instructor(user_id)));
drop policy if exists "own posts update" on public.posts;
create policy "own posts update" on public.posts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and (audience = 'public' or public.is_instructor(user_id)));

drop policy if exists "read media" on public.post_media;
create policy "read media" on public.post_media for select to authenticated
  using (exists (
    select 1 from posts p where p.id = post_id
      and (p.audience = 'public' or p.user_id = (select auth.uid()) or public.has_premium_access(p.user_id::text))
  ));

-- ---------------------------------------------------------------------------
-- Private storage for subscriber-only media and swing review videos.
--   <instructorId>/<postId>/<file>                  subscriber-only post media
--   reviews/<instructorId>/<studentId>/<file>       swing review videos
-- No public URLs: the app asks for short-lived signed links, which storage
-- only grants to people these policies allow.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('premium', 'premium', false, 104857600,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "premium read" on storage.objects;
drop policy if exists "premium upload" on storage.objects;
drop policy if exists "premium delete" on storage.objects;
create policy "premium read" on storage.objects for select to authenticated
  using (bucket_id = 'premium' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or ((storage.foldername(name))[1] <> 'reviews' and public.has_premium_access((storage.foldername(name))[1]))
    or ((storage.foldername(name))[1] = 'reviews'
        and (select auth.uid())::text in ((storage.foldername(name))[2], (storage.foldername(name))[3]))
  ));
create policy "premium upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'premium' and (
    ((storage.foldername(name))[1] = (select auth.uid())::text and public.is_instructor((select auth.uid())))
    or ((storage.foldername(name))[1] = 'reviews'
        and (storage.foldername(name))[3] = (select auth.uid())::text
        and public.has_premium_access((storage.foldername(name))[2]))
  ));
create policy "premium delete" on storage.objects for delete to authenticated
  using (bucket_id = 'premium' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or ((storage.foldername(name))[1] = 'reviews' and (storage.foldername(name))[3] = (select auth.uid())::text)
  ));
