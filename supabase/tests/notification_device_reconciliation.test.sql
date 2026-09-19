begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users(id, email) values
  ('54000000-0000-4000-8000-000000000001', 'push-state@example.test');
insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, user_agent)
values (
  '54000000-0000-4000-8000-000000000001',
  'https://fcm.googleapis.com/fcm/send/device-one',
  repeat('p', 32), repeat('a', 16), 'pgTAP'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '54000000-0000-4000-8000-000000000001', true);

select ok((select device_registered from public.get_notification_settings(
  'https://fcm.googleapis.com/fcm/send/device-one'
)), 'the exact current endpoint is registered');
select is((select registered_device_count from public.get_notification_settings(
  'https://fcm.googleapis.com/fcm/send/device-one'
)), 1::bigint, 'the caller sees its registered device count');
select isnt((select device_registered from public.get_notification_settings(
  'https://fcm.googleapis.com/fcm/send/another-device'
)), true, 'another endpoint is not treated as this device');
select is((select registered_device_count from public.get_notification_settings(null)),
  1::bigint, 'server-only registration state remains visible when the browser has no endpoint');
select throws_ok(
  $$ select * from public.get_notification_settings(repeat('x', 4097)) $$,
  'P0001', 'The push endpoint is invalid.', 'oversized endpoint input is rejected'
);

select * from finish();
rollback;
