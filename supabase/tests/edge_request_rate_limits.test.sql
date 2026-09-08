begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select has_table('private', 'edge_request_limits', 'durable Edge request counters exist');
select has_function('public', 'consume_edge_request_limit', array['text', 'integer', 'integer'],
  'service-role Edge limit RPC exists');
select function_privs_are('public', 'consume_edge_request_limit', array['text', 'integer', 'integer'],
  'service_role', array['EXECUTE'], 'service role can consume Edge limits');
select function_privs_are('public', 'consume_edge_request_limit', array['text', 'integer', 'integer'],
  'authenticated', array[]::text[], 'authenticated clients cannot consume or reset Edge limits');

set local role service_role;
select is((select allowed from public.consume_edge_request_limit('test:durable-limit', 2, 60)), true,
  'first request is allowed');
select is((select allowed from public.consume_edge_request_limit('test:durable-limit', 2, 60)), true,
  'request at the limit is allowed');
select is((select allowed from public.consume_edge_request_limit('test:durable-limit', 2, 60)), false,
  'request beyond the limit is rejected and still counted');
select ok((select retry_after_seconds between 1 and 60
  from public.consume_edge_request_limit('test:durable-limit', 2, 60)),
  'denial returns a bounded retry delay');

select * from finish();
rollback;
