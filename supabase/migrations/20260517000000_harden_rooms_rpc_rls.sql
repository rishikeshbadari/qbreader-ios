create extension if not exists pgcrypto;
create schema if not exists private;

revoke all on schema private from public;

create table if not exists private.rooms (
  code text primary key,
  host_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '6 hours')
);

alter table private.rooms
  add column if not exists host_token uuid not null default gen_random_uuid(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists expires_at timestamptz not null default (now() + interval '6 hours');

do $$
begin
  if to_regclass('public.rooms') is not null then
    alter table public.rooms
      add column if not exists host_token uuid not null default gen_random_uuid(),
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists expires_at timestamptz not null default (now() + interval '6 hours');

    insert into private.rooms (code, host_token, created_at, expires_at)
    select
      upper(trim(code)),
      coalesce(host_token, gen_random_uuid()),
      coalesce(created_at, now()),
      coalesce(expires_at, now() + interval '6 hours')
    from public.rooms
    on conflict (code) do update
    set
      host_token = excluded.host_token,
      created_at = excluded.created_at,
      expires_at = excluded.expires_at;
  end if;
end;
$$;

drop table if exists public.rooms cascade;

update private.rooms
set
  code = upper(trim(code)),
  host_token = coalesce(host_token, gen_random_uuid()),
  created_at = coalesce(created_at, now()),
  expires_at = coalesce(expires_at, now() + interval '6 hours');

create unique index if not exists rooms_code_unique_idx on private.rooms (code);
create index if not exists rooms_expires_at_idx on private.rooms (expires_at);

alter table private.rooms enable row level security;

revoke all on table private.rooms from public;
revoke all on table private.rooms from anon;
revoke all on table private.rooms from authenticated;

grant usage on schema private to anon, authenticated;
grant select, insert, delete on table private.rooms to anon, authenticated;

drop policy if exists rooms_rpc_select_exists on private.rooms;
drop policy if exists rooms_rpc_insert_created on private.rooms;
drop policy if exists rooms_rpc_delete_expired on private.rooms;
drop policy if exists rooms_rpc_delete_host on private.rooms;

create policy rooms_rpc_select_exists
on private.rooms
for select
to anon, authenticated
using (
  current_setting('app.rooms_rpc_action', true) = 'room_exists'
  and code = current_setting('app.rooms_code', true)
  and expires_at > now()
);

create policy rooms_rpc_insert_created
on private.rooms
for insert
to anon, authenticated
with check (
  current_setting('app.rooms_rpc_action', true) = 'create_room'
  and code ~ '^[A-HJ-NP-Z2-9]{6}$'
  and host_token is not null
  and created_at >= now() - interval '1 minute'
  and created_at <= now() + interval '1 minute'
  and expires_at > now()
  and expires_at <= now() + interval '6 hours 1 minute'
);

create policy rooms_rpc_delete_expired
on private.rooms
for delete
to anon, authenticated
using (
  current_setting('app.rooms_rpc_action', true) = 'create_room'
  and expires_at < now()
);

create policy rooms_rpc_delete_host
on private.rooms
for delete
to anon, authenticated
using (
  current_setting('app.rooms_rpc_action', true) = 'delete_room'
  and code = current_setting('app.rooms_code', true)
  and host_token::text = current_setting('app.rooms_host_token', true)
);

create or replace function public.create_room()
returns table(code text, host_token uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate_code text;
  generated_host_token uuid;
begin
  perform set_config('app.rooms_rpc_action', 'create_room', true);

  delete from private.rooms
  where private.rooms.expires_at < now();

  for attempt in 1..25 loop
    candidate_code := '';

    for position in 1..6 loop
      candidate_code := candidate_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    generated_host_token := gen_random_uuid();

    begin
      insert into private.rooms (code, host_token, created_at, expires_at)
      values (candidate_code, generated_host_token, now(), now() + interval '6 hours');

      code := candidate_code;
      host_token := generated_host_token;
      return next;
      return;
    exception
      when unique_violation then
    end;
  end loop;

  raise exception 'Unable to allocate room code';
end;
$$;

create or replace function public.room_exists(p_code text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_code text := upper(trim(coalesce(p_code, '')));
  exists_active_room boolean;
begin
  if normalized_code = '' then
    return false;
  end if;

  perform set_config('app.rooms_rpc_action', 'room_exists', true);
  perform set_config('app.rooms_code', normalized_code, true);

  select exists (
    select 1
    from private.rooms
    where private.rooms.code = normalized_code
      and private.rooms.expires_at > now()
  )
  into exists_active_room;

  return exists_active_room;
end;
$$;

create or replace function public.delete_room(p_code text, p_host_token uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_code text := upper(trim(coalesce(p_code, '')));
  deleted_count integer;
begin
  if normalized_code = '' or p_host_token is null then
    return false;
  end if;

  perform set_config('app.rooms_rpc_action', 'delete_room', true);
  perform set_config('app.rooms_code', normalized_code, true);
  perform set_config('app.rooms_host_token', p_host_token::text, true);

  delete from private.rooms
  where private.rooms.code = normalized_code
    and private.rooms.host_token = p_host_token;

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.create_room() from public;
revoke all on function public.room_exists(text) from public;
revoke all on function public.delete_room(text, uuid) from public;

grant execute on function public.create_room() to anon, authenticated;
grant execute on function public.room_exists(text) to anon, authenticated;
grant execute on function public.delete_room(text, uuid) to anon, authenticated;
