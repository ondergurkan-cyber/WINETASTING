-- Tasting app: sync database. Paste this whole file into Supabase, SQL Editor, and press Run.
-- Safe to run again.

-- One table holds every record (events, wines, photos' details, cellar, merchants, settings).
create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  store text not null,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at bigint not null,                       -- when the user changed it (device clock, ms)
  server_updated_at timestamptz not null default clock_timestamp(),  -- when the server got it
  primary key (user_id, store, id)
);
create index if not exists records_pull on public.records (user_id, server_updated_at);

-- Newest change wins: an older change arriving late (an offline device) never overwrites a newer one.
create or replace function public.records_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists records_guard on public.records;
create trigger records_guard before insert or update on public.records
  for each row execute function public.records_guard();

-- Each person sees and changes only their own records.
alter table public.records enable row level security;
drop policy if exists "own records" on public.records;
create policy "own records" on public.records for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Photos and videos: a private bucket, one folder per person.
insert into storage.buckets (id, name, public, file_size_limit)
  values ('media', 'media', false, 52428800)
  on conflict (id) do nothing;
drop policy if exists "own media read" on storage.objects;
drop policy if exists "own media write" on storage.objects;
drop policy if exists "own media update" on storage.objects;
drop policy if exists "own media delete" on storage.objects;
create policy "own media read" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own media write" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own media update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
