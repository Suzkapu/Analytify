import type {SupabaseClient} from '@supabase/supabase-js';

export async function resolvePersonalClientId(
  invoke: (body: Record<string, unknown>, fallback: string) => Promise<any>,
  spotifyId: string
): Promise<string> {
  if (!/^[A-Za-z0-9._-]{1,255}$/.test(spotifyId)) throw new Error('Enter your Spotify user ID.');
  const data = await invoke({
    action: 'resolve_personal_client', claimedSpotifyId: spotifyId
  }, 'The saved personal Spotify app could not be checked. Please try again.');
  return typeof data?.clientId === 'string' && /^[A-Za-z0-9]{32}$/.test(data.clientId)
    ? data.clientId : '';
}

export async function recoverPersonalIdentity(
  client: SupabaseClient,
  invoke: (body: Record<string, unknown>, fallback: string) => Promise<any>,
  persist: (key: string, value: string) => void,
  remove: (key: string) => void,
  request: {
    clientId: string;
    accessToken: string;
    refreshToken: string;
    claimedSpotifyId: string;
  }
): Promise<{userId: string; scheduledAccess: boolean; rotatedRefreshToken: string | null}> {
  const recovery = await invoke({
    action: 'recover_personal_identity',
    ...request
  }, 'The verified personal Spotify login could not be restored. Please try again.');
  if (!recovery?.tokenHash) throw new Error('The verified personal Spotify login did not return a session.');
  const verified = await client.auth.verifyOtp({token_hash: recovery.tokenHash, type: 'magiclink'});
  if (verified.error || !verified.data.session?.user) {
    throw verified.error || new Error('The verified personal Spotify session could not be opened.');
  }
  persist('supabaseUserId', verified.data.session.user.id);
  persist('anonymousCloudIdentity', 'false');
  persist('collaborationIdentityReady', 'true');
  if (recovery.scheduledAccess === true) persist('cloudIdentityReady', 'true');
  else remove('cloudIdentityReady');
  return {
    userId: verified.data.session.user.id,
    scheduledAccess: recovery.scheduledAccess === true,
    rotatedRefreshToken: typeof recovery.rotatedRefreshToken === 'string' && recovery.rotatedRefreshToken
      ? recovery.rotatedRefreshToken : null
  };
}
