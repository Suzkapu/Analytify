import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.108.1';
import {
  encryptSpotifyRefreshToken,
  spotifyCredentialKeyRingFromEnvironment
} from '../_shared/spotify-credential-crypto.ts';
import {
  existingProfileAcceptsVerifiedIdentity,
  spotifyProfileIds,
  spotifyProfileMatches
} from './profile-verification.ts';
import {boundedFetch} from '../_shared/bounded-fetch.ts';
import {
  bearerToken,
  boundedJsonBody,
  enforceRateLimit,
  logInternalError,
  PublicRequestError,
  publicError,
  publicJson,
  requestContext,
  requireAllowedOrigin,
  validatePreflight
} from '../_shared/request-security.ts';

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeProfileImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const allowed = /(^|\.)(scdn\.co|spotifycdn\.com|fbsbx\.com)$/i.test(url.hostname);
    return url.protocol === 'https:' && allowed ? url.toString() : null;
  } catch {
    return null;
  }
}

function devProfileId(userId: string): string {
  return `de11${userId.slice(4)}`;
}

async function accessTokenFromRefreshToken(
  refreshToken: string,
  connectionMode: 'hosted' | 'personal_pkce',
  personalClientId: string | null
): Promise<{accessToken: string; refreshToken: string}> {
  const hostedClientId = requiredEnvironment('SPOTIFY_CLIENT_ID');
  const effectiveClientId = connectionMode === 'personal_pkce' ? personalClientId : hostedClientId;
  if (!effectiveClientId) throw new Error('Spotify Client ID is missing.');
  const parameters: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: effectiveClientId
  };
  if (connectionMode === 'hosted') {
    parameters.client_secret = requiredEnvironment('SPOTIFY_CLIENT_SECRET');
  }
  const response = await boundedFetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams(parameters)
  }, {retryUnsafe: true});
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.access_token) throw new Error('Spotify could not verify the refresh credential.');
  return {accessToken: body.access_token, refreshToken: body.refresh_token || refreshToken};
}

async function spotifyProfile(accessToken: string): Promise<any> {
  const response = await boundedFetch('https://api.spotify.com/v1/me', {
    headers: {Authorization: `Bearer ${accessToken}`, 'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8'}
  });
  const profile = await response.json().catch(() => ({}));
  if (!response.ok || spotifyProfileIds(profile).length === 0) throw new Error('Spotify could not verify this connection.');
  return profile;
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
    const admin = createClient(supabaseUrl, serviceRoleKey, {auth: {persistSession: false, autoRefreshToken: false}});
    await enforceRateLimit(admin, request, 'spotify-credentials:client', null, 30, 60);
    requireAllowedOrigin(context);
    const jwt = bearerToken(request);
    const {data: identity, error: identityError} = await admin.auth.getUser(jwt);
    if (identityError || !identity.user) {
      throw new PublicRequestError(401, 'session_invalid', 'The session is no longer valid.');
    }
    await enforceRateLimit(admin, request, 'spotify-credentials:user', identity.user.id, 20, 60);

    const body = await boundedJsonBody(request, 16 * 1024);
    const allowedFields = new Set([
      'action', 'profileUserId', 'connectionMode', 'clientId', 'accessToken', 'refreshToken', 'spotifyId'
    ]);
    if (Object.keys(body).some(field => !allowedFields.has(field))) {
      return json({error: 'The credential request contains unsupported fields.'}, 400);
    }
    const action = body?.action;
    const profileUserId = typeof body?.profileUserId === 'string' ? body.profileUserId : '';
    if (!isUuid(profileUserId) || ![identity.user.id, devProfileId(identity.user.id)].includes(profileUserId)) {
      return json({error: 'The profile does not belong to this session.'}, 403);
    }

    if (action === 'delete_account') {
      if (!identity.user.is_anonymous) return json({error: 'Only anonymous cloud identities can be deleted here.'}, 403);
      const profileIds = Array.from(new Set([profileUserId, identity.user.id]));
      const {error: deleteError} = await admin.from('users').delete().in('id', profileIds);
      if (deleteError) throw deleteError;
      const {error: authDeleteError} = await admin.auth.admin.deleteUser(identity.user.id);
      if (authDeleteError) throw authDeleteError;
      return json({ok: true});
    }

    if (action === 'delete_credentials') {
      const {error: credentialDeleteError} = await admin.from('spotify_credentials')
        .delete().eq('user_id', profileUserId);
      if (credentialDeleteError) throw credentialDeleteError;
      const {error: plaintextClearError} = await admin.from('users')
        .update({spotify_refresh_token: null}).eq('id', profileUserId);
      if (plaintextClearError) throw plaintextClearError;
      return json({ok: true});
    }

    if (typeof action !== 'string' || action.length > 32 || !['profile', 'store'].includes(action)) {
      return json({error: 'Unsupported credential action.'}, 400);
    }
    const connectionMode = body?.connectionMode === 'hosted' || body?.connectionMode === 'personal_pkce'
      ? body.connectionMode
      : null;
    const clientId = typeof body?.clientId === 'string' ? body.clientId.trim() : null;
    const accessToken = typeof body?.accessToken === 'string' ? body.accessToken : '';
    const submittedRefreshToken = typeof body?.refreshToken === 'string' ? body.refreshToken : '';
    const requestedSpotifyId = typeof body?.spotifyId === 'string' ? body.spotifyId : '';
    if (action === 'store' && !connectionMode) return json({error: 'Invalid connection mode.'}, 400);
    if (action === 'store' && connectionMode === 'personal_pkce' && !/^[A-Za-z0-9]{32}$/.test(clientId || '')) {
      return json({error: 'A valid Spotify Client ID is required.'}, 400);
    }
    if (!accessToken || accessToken.length > 4096) return json({error: 'A valid Spotify access token is required.'}, 400);
    if (requestedSpotifyId.length > 256) return json({error: 'The Spotify profile ID is invalid.'}, 400);
    if (action === 'store' && (!submittedRefreshToken || submittedRefreshToken.length > 4096)) {
      return json({error: 'Spotify credentials are incomplete.'}, 400);
    }

    const currentProfile = await spotifyProfile(accessToken);
    const currentProfileIds = spotifyProfileIds(currentProfile);
    let verifiedRefresh: {accessToken: string; refreshToken: string} | null = null;
    if (action === 'store') {
      verifiedRefresh = await accessTokenFromRefreshToken(submittedRefreshToken, connectionMode!, clientId);
      const refreshProfile = await spotifyProfile(verifiedRefresh.accessToken);
      const refreshProfileIds = spotifyProfileIds(refreshProfile);
      if (!currentProfileIds.some(value => refreshProfileIds.includes(value))) {
        return json({error: 'The Spotify access and refresh credentials belong to different accounts.'}, 409);
      }
    }
    if (requestedSpotifyId && !spotifyProfileMatches(currentProfile, requestedSpotifyId)) {
      return json({error: 'The verified Spotify ID does not match the requested profile.'}, 409);
    }

    const {data: existingProfile, error: profileError} = await admin.from('users')
      .select('id, spotify_id').eq('id', profileUserId).maybeSingle();
    if (profileError) throw profileError;
    if (existingProfile && !existingProfileAcceptsVerifiedIdentity(
      existingProfile.spotify_id, profileUserId, currentProfile
    )) {
      return json({error: 'This Spotify account does not match the existing Analytify profile.'}, 409);
    }
    const finalSpotifyId = requestedSpotifyId || currentProfile.account_id || currentProfile.id;
    const conflictingSpotifyIds = Array.from(new Set([
      finalSpotifyId,
      ...currentProfileIds,
      ...currentProfileIds.map(value => `${value}_dev`)
    ]));
    const {data: conflictingProfile, error: conflictError} = await admin.from('users')
      .select('id').in('spotify_id', conflictingSpotifyIds).neq('id', profileUserId).limit(1).maybeSingle();
    if (conflictError) throw conflictError;
    if (conflictingProfile) return json({error: 'This Spotify ID already belongs to another Analytify profile.'}, 409);

    const {error: profileSaveError} = await admin.from('users').upsert({
      id: profileUserId,
      spotify_id: finalSpotifyId,
      display_name: currentProfile.display_name || 'Spotify User',
      profile_pic_url: safeProfileImageUrl(currentProfile.images?.[0]?.url)
    }, {onConflict: 'id'});
    if (profileSaveError) throw profileSaveError;
    if (action === 'profile') return json({ok: true, spotifyId: finalSpotifyId});

    const encrypted = await encryptSpotifyRefreshToken(
      verifiedRefresh!.refreshToken,
      spotifyCredentialKeyRingFromEnvironment()
    );
    const {error: credentialError} = await admin.from('spotify_credentials').upsert({
      user_id: profileUserId,
      connection_mode: connectionMode,
      client_id: connectionMode === 'personal_pkce' ? clientId : null,
      refresh_token_ciphertext: encrypted.ciphertext,
      refresh_token_nonce: encrypted.nonce,
      key_version: encrypted.keyVersion,
      updated_at: new Date().toISOString()
    }, {onConflict: 'user_id'});
    if (credentialError) throw credentialError;
    const {error: plaintextClearError} = await admin.from('users')
      .update({spotify_refresh_token: null}).eq('id', profileUserId);
    if (plaintextClearError) throw plaintextClearError;
    return json({
      ok: true,
      spotifyId: finalSpotifyId,
      connectionMode,
      rotatedRefreshToken: verifiedRefresh!.refreshToken !== submittedRefreshToken
        ? verifiedRefresh!.refreshToken
        : null
    });
  } catch (error) {
    if (error instanceof PublicRequestError) return publicError(context, error);
    logInternalError(context, 'spotify credential operation', error);
    return publicError(context, new PublicRequestError(
      500, 'credential_operation_failed', 'The credential operation could not be completed. Please try again.'
    ));
  }
});
