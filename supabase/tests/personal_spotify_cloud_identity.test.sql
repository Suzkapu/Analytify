begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users(id, email) values
  ('41000000-0000-4000-8000-000000000001', 'hosted@example.test'),
  ('42000000-0000-4000-8000-000000000002', null);

select lives_ok($$
  update public.users set spotify_id = 'same-verified-spotify-account'
  where id = '41000000-0000-4000-8000-000000000001'
$$, 'hosted profile accepts its verified Spotify identity');
select lives_ok($$
  update public.users set
    spotify_id = 'personal:42000000-0000-4000-8000-000000000002',
    verified_spotify_id = 'same-verified-spotify-account'
  where id = '42000000-0000-4000-8000-000000000002'
$$, 'personal-app cloud profile stores a scoped unique identity');
update public.users set verified_spotify_id = 'same-verified-spotify-account'
where id = '41000000-0000-4000-8000-000000000001';
select is((select count(*) from public.users where verified_spotify_id = 'same-verified-spotify-account'), 2::bigint,
  'hosted and personal identities may reference the same server-verified Spotify account');
select is((select count(distinct spotify_id) from public.users
  where verified_spotify_id = 'same-verified-spotify-account'), 2::bigint,
  'cloud principals retain distinct unique profile identities');
select throws_ok($$
  update public.users set spotify_id = 'same-verified-spotify-account'
  where id = '42000000-0000-4000-8000-000000000002'
$$, '23505', null, 'the security-sensitive cloud profile identity remains globally unique');

select ok(has_function_privilege('service_role', 'private.is_valid_spotify_url(text,text)', 'EXECUTE'),
  'trusted workers can evaluate Spotify URL constraints');
select ok(not has_function_privilege('authenticated', 'private.is_valid_spotify_url(text,text)', 'EXECUTE'),
  'authenticated browsers cannot call the private URL validator');
select ok(not has_function_privilege('anon', 'private.is_valid_spotify_url(text,text)', 'EXECUTE'),
  'anonymous browsers cannot call the private URL validator');

select * from finish();
rollback;
