import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.108.1';
import {
  decryptSpotifyRefreshToken,
  encryptSpotifyRefreshToken,
  StoredSpotifyCredential
} from '../_shared/spotify-credential-crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

class SpotifyHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {...corsHeaders, 'Content-Type': 'application/json'}
  });
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

async function spotifyRequest(
  path: string,
  accessToken: string,
  init: RequestInit = {},
  retryCount = 0
): Promise<any> {
  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
  if (response.status === 429 && retryCount < 2) {
    const delaySeconds = Math.min(5, Math.max(1, Number(response.headers.get('retry-after')) || 1));
    await new Promise(resolve => setTimeout(resolve, delaySeconds * 1_000));
    return spotifyRequest(path, accessToken, init, retryCount + 1);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new SpotifyHttpError(response.status, `Spotify ${response.status}: ${text || response.statusText}`);
  }
  return text ? JSON.parse(text) : null;
}

async function refreshSpotifyAccessToken(
  refreshToken: string,
  connectionMode: 'hosted' | 'personal_pkce',
  personalClientId: string | null,
  clientId: string,
  clientSecret: string
): Promise<{accessToken: string; refreshToken?: string}> {
  const effectiveClientId = connectionMode === 'personal_pkce' ? personalClientId : clientId;
  if (!effectiveClientId) throw new Error('Spotify Client ID is missing.');
  const parameters: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: effectiveClientId
  };
  if (connectionMode === 'hosted') parameters.client_secret = clientSecret;
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams(parameters)
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(`Spotify token refresh failed (${response.status}): ${body.error_description || body.error || 'unknown error'}`);
  }
  return {accessToken: body.access_token, refreshToken: body.refresh_token};
}

function playlistName(leagueName: string): string {
  return `Analytify · ${leagueName} · Weekly Picks`.slice(0, 100);
}

async function createPrivatePlaylist(
  accessToken: string,
  name: string,
  description: string
): Promise<{id: string; url: string}> {
  const created = await spotifyRequest('/me/playlists', accessToken, {
    method: 'POST',
    body: JSON.stringify({name, description, public: false})
  });
  if (!created?.id) throw new Error('Spotify did not return a playlist ID.');
  return {id: created.id, url: created.external_urls?.spotify || ''};
}

async function replacePrivatePlaylist(
  accessToken: string,
  playlistId: string,
  name: string,
  description: string,
  trackUris: string[]
): Promise<void> {
  await spotifyRequest(`/playlists/${encodeURIComponent(playlistId)}`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({name, description, public: false})
  });
  await spotifyRequest(`/playlists/${encodeURIComponent(playlistId)}/items`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({uris: trackUris.slice(0, 100)})
  });
}

function getJwtRole(jwt: string): string | null {
  try {
    const parts = jwt.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', {headers: corsHeaders});
  if (request.method !== 'POST') return json({error: 'Method not allowed.'}, 405);

  try {
    const supabaseUrl = requiredEnvironment('SUPABASE_URL');
    const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
    const spotifyClientId = requiredEnvironment('SPOTIFY_CLIENT_ID');
    const spotifyClientSecret = requiredEnvironment('SPOTIFY_CLIENT_SECRET');
    const encryptionKey = requiredEnvironment('SPOTIFY_TOKEN_ENCRYPTION_KEY');
    const authorization = request.headers.get('Authorization') || '';
    const jwt = authorization.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({error: 'Authentication is required.'}, 401);

    const body = await request.json().catch(() => ({}));
    const leagueId = typeof body?.leagueId === 'string' ? body.leagueId : '';
    const createForCurrentUser = body?.createForCurrentUser === true;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(leagueId)) {
      return json({error: 'A valid Song League ID is required.'}, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {persistSession: false, autoRefreshToken: false}
    });

    const isServiceRole = jwt === serviceRoleKey || getJwtRole(jwt) === 'service_role';
    let callerUserId: string | null = null;

    if (!isServiceRole) {
      const {data: identity, error: identityError} = await admin.auth.getUser(jwt);
      if (identityError || !identity.user) return json({error: 'The session is no longer valid.'}, 401);
      callerUserId = identity.user.id;

      // Restrict league-wide fan-out and cross-user playlist updates to trusted worker
      if (body?.allMembers === true || (body?.userId && body.userId !== callerUserId)) {
        return json({error: 'Forbidden. League-wide playlist synchronization is restricted to the trusted worker.'}, 403);
      }

      const {data: membership, error: membershipError} = await admin
        .from('song_league_members')
        .select('user_id')
        .eq('league_id', leagueId)
        .eq('user_id', callerUserId)
        .is('left_at', null)
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership) return json({error: 'You are not an active member of this Song League.'}, 403);

      // Per-member rate limit (5-second window)
      const {data: userPlaylist} = await admin
        .from('song_league_playlists')
        .select('last_synced_at, last_error')
        .eq('league_id', leagueId)
        .eq('user_id', callerUserId)
        .maybeSingle();

      if (userPlaylist?.last_synced_at && !userPlaylist.last_error) {
        const elapsedMs = Date.now() - new Date(userPlaylist.last_synced_at).getTime();
        if (elapsedMs < 5000) {
          const retryAfter = Math.max(1, Math.ceil((5000 - elapsedMs) / 1000));
          return new Response(
            JSON.stringify({error: 'Rate limit exceeded. Please wait a few seconds before syncing again.'}),
            {
              status: 429,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
                'Retry-After': String(retryAfter)
              }
            }
          );
        }
      }
    }

    const {data: lockAcquired, error: lockError} = await admin.rpc(
      'try_lock_song_league_playlist_sync',
      {p_league_id: leagueId}
    );
    if (lockError) throw lockError;
    if (!lockAcquired) {
      return json({error: 'Playlist synchronization is already in progress for this league.'}, 409);
    }

    try {
      let finalResults: Array<{userId: string; success: boolean; error?: string; skipped?: boolean}> = [];
      let finalRevision = -1;

      // A second pass catches another recommendation arriving while the first pass is updating Spotify.
      for (let pass = 0; pass < 3; pass++) {
        const {data: payloadRows, error: payloadError} = await admin.rpc(
          'get_song_league_weekly_playlist_payload',
          {p_league_id: leagueId}
        );
        if (payloadError) throw payloadError;
        const payload = payloadRows?.[0];
        if (!payload) return json({error: 'The Song League is unavailable.'}, 404);

        const {data: members, error: membersError} = await admin
          .from('song_league_members')
          .select('user_id, display_name')
          .eq('league_id', leagueId)
          .is('left_at', null)
          .order('joined_at', {ascending: true});
        if (membersError) throw membersError;

        const userIds = (members || []).map((member: any) => member.user_id);
        const [
          {data: profiles, error: profileError},
          {data: credentialRows, error: credentialError},
          {data: mappings, error: mappingError}
        ] = await Promise.all([
          admin.from('users').select('id, spotify_refresh_token').in('id', userIds),
          admin.from('spotify_credentials').select('*').in('user_id', userIds),
          admin.from('song_league_playlists').select('*').eq('league_id', leagueId)
        ]);
        if (profileError) throw profileError;
        if (credentialError) throw credentialError;
        if (mappingError) throw mappingError;

        const profileById = new Map((profiles || []).map((profile: any) => [profile.id, profile]));
        const credentialById = new Map((credentialRows || []).map((credential: any) => [credential.user_id, credential]));
        const mappingById = new Map((mappings || []).map((mapping: any) => [mapping.user_id, mapping]));

        let targetMembers: any[];
        if (!isServiceRole) {
          targetMembers = (members || []).filter((member: any) => {
            if (member.user_id !== callerUserId) return false;
            return createForCurrentUser || mappingById.has(member.user_id);
          });
        } else {
          const specificUserId = typeof body?.userId === 'string' ? body.userId : null;
          targetMembers = (members || []).filter((member: any) => {
            if (specificUserId) return member.user_id === specificUserId;
            return body?.allMembers === true || mappingById.has(member.user_id);
          });
        }

        const name = playlistName(payload.league_name);
        const description = `This Friday's Song League picks for ${payload.league_name}. Private and refreshed automatically by Analytify.`.slice(0, 300);
        const trackUris = Array.isArray(payload.track_uris) ? payload.track_uris : [];
        finalRevision = Number(payload.playlist_revision || 0);
        finalResults = [];

        // Keep updates sequential: private beta leagues are small and Spotify rate limits are shared.
        for (const member of targetMembers) {
          const profile: any = profileById.get(member.user_id);
          const mapping: any = mappingById.get(member.user_id);
          let playlistId = mapping?.spotify_playlist_id || '';
          let playlistUrl = mapping?.spotify_playlist_url || '';

          // Skip already-applied playlist revisions without calling Spotify APIs
          if (
            playlistId &&
            !mapping?.last_error &&
            Number(mapping?.last_synced_revision || 0) >= finalRevision &&
            (mapping?.last_synced_round_id || null) === (payload.round_id || null)
          ) {
            finalResults.push({userId: member.user_id, success: true, skipped: true});
            continue;
          }

          try {
            const storedCredential: any = credentialById.get(member.user_id);
            let connectionMode: 'hosted' | 'personal_pkce' = 'hosted';
            let personalClientId: string | null = null;
            let refreshToken = profile?.spotify_refresh_token || '';
            if (storedCredential) {
              connectionMode = storedCredential.connection_mode;
              personalClientId = storedCredential.client_id || null;
              refreshToken = await decryptSpotifyRefreshToken(
                storedCredential as StoredSpotifyCredential,
                encryptionKey
              );
            }
            if (!refreshToken) throw new Error('Reconnect Spotify so Analytify can maintain this playlist.');
            const token = await refreshSpotifyAccessToken(
              refreshToken,
              connectionMode,
              personalClientId,
              spotifyClientId,
              spotifyClientSecret
            );
            if (!storedCredential || token.refreshToken) {
              const nextRefreshToken = token.refreshToken || refreshToken;
              const encrypted = await encryptSpotifyRefreshToken(nextRefreshToken, encryptionKey);
              const {error: tokenError} = await admin.from('spotify_credentials').upsert({
                user_id: member.user_id,
                connection_mode: connectionMode,
                client_id: connectionMode === 'personal_pkce' ? personalClientId : null,
                refresh_token_ciphertext: encrypted.ciphertext,
                refresh_token_nonce: encrypted.nonce,
                key_version: 1,
                updated_at: new Date().toISOString()
              }, {onConflict: 'user_id'});
              if (tokenError) throw tokenError;
              const {error: plaintextClearError} = await admin.from('users')
                .update({spotify_refresh_token: null}).eq('id', member.user_id);
              if (plaintextClearError) throw plaintextClearError;
            }

            if (!playlistId) {
              const created = await createPrivatePlaylist(token.accessToken, name, description);
              playlistId = created.id;
              playlistUrl = created.url;
            }
            try {
              await replacePrivatePlaylist(token.accessToken, playlistId, name, description, trackUris);
            } catch (error) {
              if (!(error instanceof SpotifyHttpError) || error.status !== 404) throw error;
              const created = await createPrivatePlaylist(token.accessToken, name, description);
              playlistId = created.id;
              playlistUrl = created.url;
              await replacePrivatePlaylist(token.accessToken, playlistId, name, description, trackUris);
            }

            const {error: saveError} = await admin.from('song_league_playlists').upsert({
              league_id: leagueId,
              user_id: member.user_id,
              spotify_playlist_id: playlistId,
              spotify_playlist_url: playlistUrl,
              last_synced_revision: finalRevision,
              last_synced_round_id: payload.round_id || null,
              last_synced_at: new Date().toISOString(),
              last_error: null,
              updated_at: new Date().toISOString()
            }, {onConflict: 'league_id,user_id'});
            if (saveError) throw saveError;
            finalResults.push({userId: member.user_id, success: true, skipped: false});
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Playlist synchronization failed.';
            await admin.from('song_league_playlists').upsert({
              league_id: leagueId,
              user_id: member.user_id,
              spotify_playlist_id: playlistId || null,
              spotify_playlist_url: playlistUrl,
              last_synced_revision: Number(mapping?.last_synced_revision || 0),
              last_synced_round_id: mapping?.last_synced_round_id || null,
              last_error: message.slice(0, 500),
              updated_at: new Date().toISOString()
            }, {onConflict: 'league_id,user_id'});
            finalResults.push({userId: member.user_id, success: false, error: message, skipped: false});
          }
        }

        const {data: latestRows, error: latestError} = await admin.rpc(
          'get_song_league_weekly_playlist_payload',
          {p_league_id: leagueId}
        );
        if (latestError) throw latestError;
        if (Number(latestRows?.[0]?.playlist_revision || 0) === finalRevision) break;
      }

      const failed = finalResults.filter(result => !result.success);
      const skipped = finalResults.filter(result => result.skipped);
      return json({
        ok: failed.length === 0,
        revision: finalRevision,
        synced: finalResults.length - failed.length - skipped.length,
        skipped: skipped.length,
        failed: failed.length,
        results: finalResults
      });
    } finally {
      try {
        await admin.rpc('unlock_song_league_playlist_sync', {
          p_league_id: leagueId
        });
      } catch {
        // Ignore unlock cleanup failure to avoid hiding main task errors
      }
    }
  } catch (error) {
    return json({error: error instanceof Error ? error.message : 'Playlist synchronization failed.'}, 500);
  }
});
