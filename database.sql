-- TravelTogether database setup for Supabase.
-- Run once: Supabase dashboard -> SQL Editor -> New query -> paste all of this -> Run.

-- 1. Profiles: one row per account, created automatically on sign-up.
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60))
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- 2. Each user's own data: trips, itinerary, budget, packing, saved destinations.
--    One row per browser storage key (tp:trip, tp:trips, tp:budget:<trip id>, ...).
create table if not exists public.user_data (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  key text not null check (key ~ '^tp:[A-Za-z0-9:_-]{1,150}$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.user_data enable row level security;
drop policy if exists "own data" on public.user_data;
create policy "own data" on public.user_data for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. Destinations added on the Admin page: everyone can read, only admins can change.
create table if not exists public.destinations (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  data jsonb not null,
  created_by uuid default auth.uid() references auth.users on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.destinations enable row level security;
drop policy if exists "anyone reads" on public.destinations;
drop policy if exists "admins insert" on public.destinations;
drop policy if exists "admins update" on public.destinations;
drop policy if exists "admins delete" on public.destinations;
create policy "anyone reads" on public.destinations for select using (true);
create policy "admins insert" on public.destinations for insert with check (public.is_admin());
create policy "admins update" on public.destinations for update using (public.is_admin()) with check (public.is_admin());
create policy "admins delete" on public.destinations for delete using (public.is_admin());

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch before update on public.user_data for each row execute function public.touch_updated_at();
drop trigger if exists destinations_touch on public.destinations;
create trigger destinations_touch before update on public.destinations for each row execute function public.touch_updated_at();

grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.user_data to authenticated;
grant select on public.destinations to anon, authenticated;
grant insert, update, delete on public.destinations to authenticated;

-- 4. Make yourself an admin AFTER you have created your account on the site
--    (change the email, then run just this line):
-- update public.profiles set is_admin = true where id = (select id from auth.users where email = 'you@example.com');
