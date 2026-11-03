-- SportzWire Team: initial schema
-- Run with `supabase db push` (or paste into the Supabase SQL editor).


-- ─────────────────────────────────────────────────────────────
-- Profiles (one per auth user)
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  full_name        text not null default '',
  avatar_url       text,
  role             text not null default 'member' check (role in ('admin', 'member')),
  approved         boolean not null default false,  -- admin must approve new sign-ups
  can_post_social  boolean not null default false,  -- may publish to the business IG / FB
  daily_post_cap   int     not null default 3 check (daily_post_cap >= 0),
  push_token       text,
  created_at       timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Helper functions (security definer so policies can use them)
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select approved from profiles where id = auth.uid()), false);
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select approved and role = 'admin' from profiles where id = auth.uid()), false);
$$;

-- New sign-up → profile. The very first user becomes an approved admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  select not exists (select 1 from profiles) into first_user;
  insert into profiles (id, full_name, role, approved, can_post_social)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when first_user then 'admin' else 'member' end,
    first_user,
    first_user
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Members may edit their own name/avatar/push token, but only admins
-- (or the service role, where auth.uid() is null) may change privileges.
create or replace function public.protect_profile_privileges() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role            := old.role;
    new.approved        := old.approved;
    new.can_post_social := old.can_post_social;
    new.daily_post_cap  := old.daily_post_cap;
  end if;
  return new;
end $$;

create trigger profiles_protect_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- ─────────────────────────────────────────────────────────────
-- Teams (groups inside SportzWire). One "everyone" team is built in.
-- ─────────────────────────────────────────────────────────────
create table public.teams (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  is_everyone  boolean not null default false,  -- every approved member belongs
  created_at   timestamptz not null default now()
);

create table public.team_members (
  team_id  uuid not null references public.teams(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  primary key (team_id, user_id)
);

insert into public.teams (name, description, is_everyone)
values ('All SportzWire', 'Everyone on the team', true);

create or replace function public.is_team_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_approved() and (
    public.is_admin()
    or exists (select 1 from teams where id = t and is_everyone)
    or exists (select 1 from team_members where team_id = t and user_id = auth.uid())
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- Chat
-- ─────────────────────────────────────────────────────────────
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  body        text,
  media_path  text,                       -- object path in the team-media bucket
  media_type  text check (media_type in ('image', 'video')),
  created_at  timestamptz not null default now(),
  check (body is not null or media_path is not null)
);
create index messages_team_created on public.messages (team_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Galleries
-- ─────────────────────────────────────────────────────────────
create table public.albums (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  title       text not null,
  created_by  uuid not null references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now()
);

create table public.media (
  id          uuid primary key default gen_random_uuid(),
  album_id    uuid not null references public.albums(id) on delete cascade,
  team_id     uuid not null references public.teams(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) default auth.uid(),
  path        text not null,              -- object path in the team-media bucket
  type        text not null check (type in ('image', 'video')),
  caption     text,
  created_at  timestamptz not null default now()
);
create index media_album_created on public.media (album_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Calendar
-- ─────────────────────────────────────────────────────────────
create table public.events (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid references public.teams(id) on delete cascade,  -- null = everyone
  title        text not null,
  description  text,
  location     text,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  created_by   uuid not null references public.profiles(id) default auth.uid(),
  created_at   timestamptz not null default now()
);
create index events_starts on public.events (starts_at);

create table public.event_rsvps (
  event_id  uuid not null references public.events(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  status    text not null check (status in ('going', 'maybe', 'no')),
  primary key (event_id, user_id)
);

-- ─────────────────────────────────────────────────────────────
-- Social publishing (written only by the publish-social edge function)
-- ─────────────────────────────────────────────────────────────
create table public.social_posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.profiles(id) on delete cascade,
  caption       text not null default '',
  media_paths   text[] not null default '{}',   -- object paths in the social bucket
  media_type    text not null check (media_type in ('image', 'video', 'carousel')),
  targets       text[] not null check (targets <@ array['instagram', 'facebook']::text[] and cardinality(targets) > 0),
  status        text not null default 'pending'
                check (status in ('pending', 'publishing', 'published', 'rejected', 'failed')),
  error         text,
  ig_media_id   text,
  fb_post_id    text,
  reviewed_by   uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  published_at  timestamptz
);
create index social_posts_author_created on public.social_posts (author_id, created_at desc);

-- Connected Meta accounts. Tokens never leave the server (no RLS policies).
create table public.social_accounts (
  id                 int primary key default 1 check (id = 1),  -- single business
  page_id            text not null,
  page_name          text,
  page_access_token  text not null,
  ig_user_id         text,
  ig_username        text,
  connected_by       uuid references public.profiles(id),
  connected_at       timestamptz not null default now()
);

-- Short-lived state for the Meta OAuth round trip.
create table public.oauth_states (
  state       text primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  expires_at  timestamptz not null default now() + interval '10 minutes'
);

-- Safe-to-read view of the connection (no token).
create view public.social_connection with (security_invoker = false) as
  select page_id, page_name, ig_user_id, ig_username, connected_at
  from public.social_accounts
  where public.is_approved();

create table public.app_settings (
  id                     int primary key default 1 check (id = 1),
  require_post_approval  boolean not null default true  -- non-admin posts wait for an admin
);
insert into public.app_settings default values;

-- ─────────────────────────────────────────────────────────────
-- Row level security
-- ─────────────────────────────────────────────────────────────
alter table public.profiles        enable row level security;
alter table public.teams           enable row level security;
alter table public.team_members    enable row level security;
alter table public.messages        enable row level security;
alter table public.albums          enable row level security;
alter table public.media           enable row level security;
alter table public.events          enable row level security;
alter table public.event_rsvps     enable row level security;
alter table public.social_posts    enable row level security;
alter table public.social_accounts enable row level security;
alter table public.oauth_states    enable row level security;
alter table public.app_settings    enable row level security;

-- profiles
create policy "read own or approved" on public.profiles for select
  using (id = auth.uid() or public.is_approved());
create policy "update self" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy "admin update" on public.profiles for update
  using (public.is_admin());
create policy "admin delete" on public.profiles for delete
  using (public.is_admin() and id <> auth.uid());

-- teams
create policy "approved read teams" on public.teams for select using (public.is_approved());
create policy "admin manage teams" on public.teams for all
  using (public.is_admin()) with check (public.is_admin());

create policy "approved read members" on public.team_members for select using (public.is_approved());
create policy "admin manage members" on public.team_members for all
  using (public.is_admin()) with check (public.is_admin());

-- messages
create policy "members read" on public.messages for select using (public.is_team_member(team_id));
create policy "members send" on public.messages for insert
  with check (user_id = auth.uid() and public.is_team_member(team_id));
create policy "author or admin delete" on public.messages for delete
  using (user_id = auth.uid() or public.is_admin());

-- albums
create policy "members read" on public.albums for select using (public.is_team_member(team_id));
create policy "members create" on public.albums for insert
  with check (created_by = auth.uid() and public.is_team_member(team_id));
create policy "creator or admin edit" on public.albums for update
  using (created_by = auth.uid() or public.is_admin());
create policy "creator or admin delete" on public.albums for delete
  using (created_by = auth.uid() or public.is_admin());

-- media
create policy "members read" on public.media for select using (public.is_team_member(team_id));
create policy "members upload" on public.media for insert
  with check (
    user_id = auth.uid()
    and public.is_team_member(team_id)
    and exists (select 1 from public.albums a where a.id = album_id and a.team_id = media.team_id)
  );
create policy "uploader or admin delete" on public.media for delete
  using (user_id = auth.uid() or public.is_admin());

-- events
create policy "read events" on public.events for select
  using (public.is_approved() and (team_id is null or public.is_team_member(team_id)));
create policy "create events" on public.events for insert
  with check (
    created_by = auth.uid()
    and ((team_id is null and public.is_approved()) or public.is_team_member(team_id))
  );
create policy "creator or admin edit" on public.events for update
  using (created_by = auth.uid() or public.is_admin());
create policy "creator or admin delete" on public.events for delete
  using (created_by = auth.uid() or public.is_admin());

-- rsvps
create policy "read rsvps" on public.event_rsvps for select using (public.is_approved());
create policy "own rsvp" on public.event_rsvps for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_approved());

-- social_posts: read own (admins read all); writes go through the edge function
create policy "own or admin read" on public.social_posts for select
  using (author_id = auth.uid() or public.is_admin());

-- app_settings
create policy "approved read" on public.app_settings for select using (public.is_approved());
create policy "admin update" on public.app_settings for update using (public.is_admin());

-- social_accounts, oauth_states: no policies → only the service role can touch them.

-- ─────────────────────────────────────────────────────────────
-- Storage
-- team-media/<team_id>/<file>   chat attachments + gallery uploads
-- social/<user_id>/<file>       media staged for Instagram / Facebook
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('team-media', 'team-media', false, 524288000),  -- 500 MB (videos)
  ('social',     'social',     false, 524288000)
on conflict (id) do nothing;

create or replace function public.safe_uuid(t text) returns uuid
language plpgsql immutable as $$
begin return t::uuid; exception when others then return null; end $$;

create policy "team media read" on storage.objects for select
  using (bucket_id = 'team-media'
         and public.is_team_member(public.safe_uuid((storage.foldername(name))[1])));
create policy "team media upload" on storage.objects for insert
  with check (bucket_id = 'team-media'
              and public.is_team_member(public.safe_uuid((storage.foldername(name))[1])));
create policy "team media delete" on storage.objects for delete
  using (bucket_id = 'team-media' and (owner = auth.uid() or public.is_admin()));

create policy "social read" on storage.objects for select
  using (bucket_id = 'social'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "social upload" on storage.objects for insert
  with check (bucket_id = 'social'
              and (storage.foldername(name))[1] = auth.uid()::text
              and exists (select 1 from public.profiles p
                          where p.id = auth.uid() and p.approved and p.can_post_social));

-- ─────────────────────────────────────────────────────────────
-- Realtime
-- ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.social_posts;
alter publication supabase_realtime add table public.profiles;
