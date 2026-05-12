create extension if not exists pgcrypto;
create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

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

    drop table public.rooms;
  end if;
end;
$$;

update private.rooms
set
  code = upper(trim(code)),
  host_token = coalesce(host_token, gen_random_uuid()),
  created_at = coalesce(created_at, now()),
  expires_at = coalesce(expires_at, now() + interval '6 hours');

drop table if exists public.rooms;

create unique index if not exists rooms_code_unique_idx on private.rooms (code);
create index if not exists rooms_expires_at_idx on private.rooms (expires_at);

alter table private.rooms enable row level security;

revoke all on table private.rooms from public;
revoke all on table private.rooms from anon;
revoke all on table private.rooms from authenticated;

create or replace function public.create_room()
returns table(code text, host_token uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  generated_token uuid;
begin
  delete from private.rooms where private.rooms.expires_at < now();

  for attempt in 1..25 loop
    candidate := '';

    for position in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    generated_token := gen_random_uuid();

    begin
      insert into private.rooms (code, host_token, created_at, expires_at)
      values (candidate, generated_token, now(), now() + interval '6 hours');

      code := candidate;
      host_token := generated_token;
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
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.rooms
    where private.rooms.code = upper(trim(p_code))
      and private.rooms.expires_at > now()
  );
$$;

create or replace function public.delete_room(p_code text, p_host_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from private.rooms
  where private.rooms.code = upper(trim(p_code))
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
