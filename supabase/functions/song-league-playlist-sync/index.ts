import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.108.1';
import {
  decryptSpotifyRefreshToken,
  encryptSpotifyRefreshToken,
  spotifyCredentialKeyRingFromEnvironment,
  StoredSpotifyCredential
} from '../_shared/spotify-credential-crypto.ts';
import {boundedFetch} from '../_shared/bounded-fetch.ts';
import {
  bearerToken,
  boundedJsonBody,
  enforceRateLimit,
  isTrustedServiceToken,
  logInternalError,
  PublicRequestError,
  publicError,
  publicJson,
  requestContext,
  requireAllowedOrigin,
  validatePreflight
} from '../_shared/request-security.ts';

class SpotifyHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

async function spotifyRequest(
  path: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<any> {
  const response = await boundedFetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
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
  const response = await boundedFetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams(parameters)
  }, {retryUnsafe: true});
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

Deno.serve(async (request: Request) => {
  const context = requestContext(request);
  const json = (body: unknown, status = 200) => publicJson(context, body, status);
  try {
    if (request.method === 'OPTIONS') {
      validatePreflight(request, context);
      return new Response(null, {status: 204, headers: context.corsHeaders});
    }
    if (request.method !== 'POST') {
      throw new PublicRequestError(405, 'method_not_allowed', 'Only POST requests are supported.');
    }
    const supabaseUrl = requiredEnvironment('SUPABASE_URL');
    const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
    const spotifyClientId = requiredEnvironment('SPOTIFY_CLIENT_ID');
    const spotifyClientSecret = requiredEnvironment('SPOTIFY_CLIENT_SECRET');
    const encryptionKeyRing = spotifyCredentialKeyRingFromEnvironment();
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {persistSession: false, autoRefreshToken: false}
    });
    await enforceRateLimit(admin, request, 'playlist-sync:client', null, 40, 60);
    const jwt = bearerToken(request);
    const isServiceRole = isTrustedServiceToken(jwt, serviceRoleKey);
    requireAllowedOrigin(context, isServiceRole);
    await enforceRateLimit(
      admin, request, 'playlist-sync:caller', isServiceRole ? 'trusted-worker' : jwt, isServiceRole ? 240 : 12, 60
    );
    const body = await boundedJsonBody(request, 2 * 1024);
    const allowedFields = new Set(['leagueId', 'createForCurrentUser', 'allMembers', 'userId']);
    if (Object.keys(body).some(field => !allowedFields.has(field))) {
      return json({error: 'The playlist request contains unsupported fields.'}, 400);
    }
    const leagueId = typeof body?.leagueId === 'string' ? body.leagueId : '';
    const createForCurrentUser = body?.createForCurrentUser === true;
    if (body?.createForCurrentUser !== undefined && typeof body.createForCurrentUser !== 'boolean') {
      return json({error: 'The create-playlist option is invalid.'}, 400);
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(leagueId)) {
      return json({error: 'A valid Song League ID is required.'}, 400);
    }
    if (body?.userId !== undefined && (
      typeof body.userId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.userId)
    )) return json({error: 'A valid user ID is required.'}, 400);
    if (body?.allMembers !== undefined && typeof body.allMembers !== 'boolean') {
      return json({error: 'The all-members option is invalid.'}, 400);
    }

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

      await enforceRateLimit(admin, request, 'playlist-sync:user', callerUserId, 6, 60);
    }

    const leaseToken = crypto.randomUUID();
    const {data: lockAcquired, error: lockError} = await admin.rpc(
      'claim_song_league_playlist_sync',
      {p_league_id: leagueId, p_lease_token: leaseToken}
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
          const expectedAppliedRevision = Number(mapping?.last_synced_revision || 0);
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
                encryptionKeyRing
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
              const encrypted = await encryptSpotifyRefreshToken(nextRefreshToken, encryptionKeyRing);
              const {error: tokenError} = await admin.from('spotify_credentials').upsert({
                user_id: member.user_id,
                connection_mode: connectionMode,
                client_id: connectionMode === 'personal_pkce' ? personalClientId : null,
                refresh_token_ciphertext: encrypted.ciphertext,
                refresh_token_nonce: encrypted.nonce,
                key_version: encrypted.keyVersion,
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

            const {data: completed, error: saveError} = await admin.rpc(
              'complete_song_league_playlist_sync',
              {
                p_league_id: leagueId,
                p_user_id: member.user_id,
                p_expected_source_revision: finalRevision,
                p_expected_applied_revision: expectedAppliedRevision,
                p_expected_round_id: payload.round_id || null,
                p_lease_token: leaseToken,
                p_spotify_playlist_id: playlistId,
                p_spotify_playlist_url: playlistUrl
              }
            );
            if (saveError) throw saveError;
            if (!completed) {
              throw new Error('Song League picks changed while the Spotify playlist was updating.');
            }
            finalResults.push({userId: member.user_id, success: true, skipped: false});
          } catch (error) {
            logInternalError(context, `playlist sync member ${member.user_id}`, error);
            const message = error instanceof Error && error.message.startsWith('Reconnect Spotify')
              ? error.message
              : 'This playlist could not be updated. Please try again later.';
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
        await admin.rpc('release_song_league_playlist_sync', {
          p_league_id: leagueId,
          p_lease_token: leaseToken
        });
      } catch {
        // Ignore unlock cleanup failure to avoid hiding main task errors
      }
    }
  } catch (error) {
    if (error instanceof PublicRequestError) return publicError(context, error);
    logInternalError(context, 'playlist synchronization', error);
    return publicError(context, new PublicRequestError(
      500, 'playlist_sync_failed', 'Playlist synchronization could not be completed. Please try again.'
    ));
  }
});
