create extension if not exists pgcrypto;
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'operator' check (role in ('operator', 'admin')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'operator'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
insert into public.profiles (id, email, full_name, role)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', ''),
  'operator'
from auth.users u
on conflict (id) do nothing;
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin()
);
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  cognome text not null,
  societa text not null,
  note text not null default '',
  business_card_path text not null,
  business_card_filename text not null,
  business_card_mime text not null,
  business_card_size integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contacts_operator_id_idx on public.contacts(operator_id);
create index if not exists contacts_created_at_idx on public.contacts(created_at desc);
alter table public.contacts enable row level security;
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();
drop policy if exists "contacts_select_own_or_admin" on public.contacts;
drop policy if exists "contacts_insert_own" on public.contacts;
drop policy if exists "contacts_update_own_or_admin" on public.contacts;
drop policy if exists "contacts_delete_own_or_admin" on public.contacts;
create policy "contacts_select_own_or_admin"
on public.contacts
for select
to authenticated
using (
  operator_id = auth.uid()
  or public.is_admin()
);
create policy "contacts_insert_own"
on public.contacts
for insert
to authenticated
with check (
  operator_id = auth.uid()
  and length(trim(nome)) between 1 and 120
  and length(trim(cognome)) between 1 and 120
  and length(trim(societa)) between 1 and 180
  and length(trim(note)) <= 3000
  and business_card_mime in ('image/jpeg', 'image/png', 'image/webp')
  and business_card_size <= 5242880
);
create policy "contacts_update_own_or_admin"
on public.contacts
for update
to authenticated
using (
  operator_id = auth.uid()
  or public.is_admin()
)
with check (
  (operator_id = auth.uid() or public.is_admin())
  and length(trim(nome)) between 1 and 120
  and length(trim(cognome)) between 1 and 120
  and length(trim(societa)) between 1 and 180
  and length(trim(note)) <= 3000
  and business_card_mime in ('image/jpeg', 'image/png', 'image/webp')
  and business_card_size <= 5242880
);
create policy "contacts_delete_own_or_admin"
on public.contacts
for delete
to authenticated
using (
  operator_id = auth.uid()
  or public.is_admin()
);
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-cards',
  'business-cards',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "business_cards_select_own_or_admin" on storage.objects;
drop policy if exists "business_cards_insert_own_folder" on storage.objects;
drop policy if exists "business_cards_update_own_or_admin" on storage.objects;
drop policy if exists "business_cards_delete_own_or_admin" on storage.objects;
create policy "business_cards_select_own_or_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'business-cards'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);
create policy "business_cards_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'business-cards'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);
create policy "business_cards_update_own_or_admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'business-cards'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
)
with check (
  bucket_id = 'business-cards'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);
create policy "business_cards_delete_own_or_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'business-cards'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);
create or replace view public.contacts_with_operator as
select
  c.*,
  p.email as operator_email,
  p.full_name as operator_full_name
from public.contacts c
left join public.profiles p on p.id = c.operator_id;
alter view public.contacts_with_operator set (security_invoker = true);
