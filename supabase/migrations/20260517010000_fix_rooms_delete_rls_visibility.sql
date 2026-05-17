drop policy if exists rooms_rpc_select_exists on private.rooms;

create policy rooms_rpc_select_exists
on private.rooms
for select
to anon, authenticated
using (
  (
    current_setting('app.rooms_rpc_action', true) = 'room_exists'
    and code = current_setting('app.rooms_code', true)
    and expires_at > now()
  )
  or (
    current_setting('app.rooms_rpc_action', true) = 'delete_room'
    and code = current_setting('app.rooms_code', true)
    and host_token::text = current_setting('app.rooms_host_token', true)
  )
  or (
    current_setting('app.rooms_rpc_action', true) = 'create_room'
    and expires_at < now()
  )
);
