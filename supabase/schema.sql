-- Stargate remote sync — run once in Supabase → SQL Editor.
-- One row per user holding the whole state (export schema, background images stripped).
-- Safe to re-run.

create table if not exists public.stargate_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  revision   bigint      not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.stargate_state enable row level security;

-- Each user can read and delete only their own row. Writes go through save_stargate_state().
drop policy if exists "stargate_state: read own" on public.stargate_state;
create policy "stargate_state: read own" on public.stargate_state
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "stargate_state: insert own" on public.stargate_state;
create policy "stargate_state: insert own" on public.stargate_state
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "stargate_state: update own" on public.stargate_state;
create policy "stargate_state: update own" on public.stargate_state
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "stargate_state: delete own" on public.stargate_state;
create policy "stargate_state: delete own" on public.stargate_state
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Optimistic write: succeeds only if the row is still at expected_revision
-- (0 = the user has no row yet). Returns the new revision, or null on conflict.
create or replace function public.save_stargate_state(expected_revision bigint, new_data jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  new_revision bigint;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  -- Stargate caps configuration at ~1 MB locally; refuse anything far beyond that.
  if octet_length(new_data::text) > 2000000 then
    raise exception 'state too large';
  end if;

  if expected_revision = 0 then
    insert into public.stargate_state (user_id, data, revision)
    values (uid, new_data, 1)
    on conflict (user_id) do nothing
    returning revision into new_revision;
  else
    update public.stargate_state
       set data = new_data, revision = revision + 1, updated_at = now()
     where user_id = uid and revision = expected_revision
    returning revision into new_revision;
  end if;

  return new_revision;
end;
$$;

revoke all on function public.save_stargate_state(bigint, jsonb) from public, anon;
grant execute on function public.save_stargate_state(bigint, jsonb) to authenticated;

-- Live updates to the user's other browsers (Realtime honours the RLS read policy).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stargate_state'
  ) then
    alter publication supabase_realtime add table public.stargate_state;
  end if;
end;
$$;
