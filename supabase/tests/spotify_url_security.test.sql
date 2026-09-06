begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select ok(private.is_valid_spotify_url(
  'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=test', 'track'
), 'exact HTTPS Spotify track URLs are accepted');
select ok(private.is_valid_spotify_url(
  'https://open.spotify.com/intl-de/artist/06HL4z0CvFAxyc27GXpf02', 'artist'
), 'localized exact Spotify artist URLs are accepted');
select isnt(private.is_valid_spotify_url('javascript:alert(1)', 'track'), true,
  'script URLs are rejected');
select isnt(private.is_valid_spotify_url('data:text/html,test', 'track'), true,
  'data URLs are rejected');
select isnt(private.is_valid_spotify_url('http://open.spotify.com/track/abc', 'track'), true,
  'unencrypted Spotify URLs are rejected');
select isnt(private.is_valid_spotify_url('https://user@open.spotify.com/track/abc', 'track'), true,
  'credential-bearing URLs are rejected');
select isnt(private.is_valid_spotify_url('https://open.spotify.com.evil.test/track/abc', 'track'), true,
  'spoofed Spotify hosts are rejected');
select isnt(private.is_valid_spotify_url('https://open%2Espotify.com/track/abc', 'track'), true,
  'encoded Spotify authorities are rejected');
select isnt(private.is_valid_spotify_url('https://open.spotify.com/artist/abc', 'track'), true,
  'entity type substitution is rejected');

insert into public.artists(id, name, spotify_url) values
  ('spotifyurlartist00001', 'Safe', 'https://open.spotify.com/artist/abc');
select lives_ok($$ update public.artists set spotify_url = 'https://open.spotify.com/artist/def'
  where id = 'spotifyurlartist00001' $$, 'catalog constraints retain safe URLs');
select throws_ok($$ update public.artists set spotify_url = 'javascript:alert(1)'
  where id = 'spotifyurlartist00001' $$, '23514', null,
  'catalog constraints reject poisoned URLs at the write boundary');

insert into auth.users(id, email) values
  ('33000000-0000-4000-8000-000000000001', 'url-owner@example.test');
insert into public.playlist_shares(
  owner_user_id, source_playlist_id, playlist_name, token_hash, snapshot_hash
) values (
  '33000000-0000-4000-8000-000000000001', 'playlist', 'Playlist', repeat('c', 64), repeat('d', 64)
) returning id \gset url_
select throws_ok(format($statement$insert into public.playlist_share_tracks(share_id, position, track_id, track)
  values (%L, 0, 'track', '{"id":"track","spotifyUrl":"javascript:alert(1)"}')$statement$, :'url_id'),
  '23514', null, 'nested shared-playlist URLs cannot bypass database validation');

select * from finish();
rollback;
