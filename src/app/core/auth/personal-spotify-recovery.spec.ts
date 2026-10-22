import {describe, expect, it, vi} from 'vitest';
import {recoverPersonalIdentity, resolvePersonalClientId} from './personal-spotify-recovery';
import type {SupabaseClient} from '@supabase/supabase-js';

describe('Verified personal Spotify account recovery', () => {
  const request = {clientId: '12345678901234567890123456789012', accessToken: 'isolated-access', refreshToken: 'isolated-refresh', claimedSpotifyId: 'existing-profile'};

  it.each(['', 'https://spotify.invalid/person', 'contains space', 'a'.repeat(256)])('rejects invalid public lookup identity without sending a credential request (%s)', async identity => {
    const invoke = vi.fn();
    await expect(resolvePersonalClientId(invoke, identity)).rejects.toThrow('Enter your Spotify user ID');
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([null, {}, {clientId: 17}, {clientId: 'short'}, {clientId: 'x'.repeat(33)}])('treats an unavailable or invalid saved Client ID as no saved app (%j)', async response => {
    expect(await resolvePersonalClientId(async () => response, 'public-listener_1')).toBe('');
  });

  it('accepts the public app Client ID returned for the requested Spotify identity', async () => {
    const invoke = vi.fn(async () => ({clientId: request.clientId}));
    expect(await resolvePersonalClientId(invoke, 'public-listener_1')).toBe(request.clientId);
    expect(invoke).toHaveBeenCalledWith({action: 'resolve_personal_client', claimedSpotifyId: 'public-listener_1'}, expect.any(String));
  });

  function boundary(response: unknown, verification = {data: {session: {user: {id: 'verified-cloud'}}}, error: null} as any) {
    const values = new Map([['cloudIdentityReady', 'true'], ['unrelated-preference', 'keep']]);
    const verifyOtp = vi.fn(async () => verification);
    const invoke = vi.fn(async () => response);
    const client = {auth: {verifyOtp}} as unknown as SupabaseClient;
    const recover = () => recoverPersonalIdentity(client, invoke, (key, value) => {values.set(key, value);}, key => {values.delete(key);}, request);
    return {values, verifyOtp, invoke, recover};
  }

  it.each([null, {}, {tokenHash: ''}])('cannot publish a cloud identity without a verified login token (%j)', async response => {
    const fixture = boundary(response); const previous = new Map(fixture.values);
    await expect(fixture.recover()).rejects.toThrow('did not return a session');
    expect(fixture.values).toEqual(previous);
    expect(fixture.verifyOtp).not.toHaveBeenCalled();
  });

  it.each([
    {data: {session: null}, error: null},
    {data: {session: {}}, error: null},
    {data: {session: {user: {id: 'untrusted'}}}, error: new Error('isolated OTP rejected')}
  ])('does not publish capabilities when verification fails or lacks a user (%j)', async verification => {
    const fixture = boundary({tokenHash: 'isolated-verified-hash'}, verification); const previous = new Map(fixture.values);
    await expect(fixture.recover()).rejects.toThrow(verification.error ? 'isolated OTP rejected' : 'session could not be opened');
    expect(fixture.values).toEqual(previous);
    expect(fixture.verifyOtp).toHaveBeenCalledWith({token_hash: 'isolated-verified-hash', type: 'magiclink'});
  });

  it.each([
    {scheduledAccess: true, rotatedRefreshToken: 'rotated-refresh', expectedToken: 'rotated-refresh'},
    {scheduledAccess: false, rotatedRefreshToken: '', expectedToken: null},
    {scheduledAccess: 'true', rotatedRefreshToken: 17, expectedToken: null},
    {scheduledAccess: undefined, rotatedRefreshToken: undefined, expectedToken: null}
  ])('restores only server-verified capabilities and usable token rotation (%j)', async response => {
    const fixture = boundary({tokenHash: 'isolated-verified-hash', ...response});
    expect(await fixture.recover()).toEqual({userId: 'verified-cloud', scheduledAccess: response.scheduledAccess === true, rotatedRefreshToken: response.expectedToken});
    expect(fixture.values.get('supabaseUserId')).toBe('verified-cloud');
    expect(fixture.values.get('anonymousCloudIdentity')).toBe('false');
    expect(fixture.values.get('collaborationIdentityReady')).toBe('true');
    expect(fixture.values.get('cloudIdentityReady')).toBe(response.scheduledAccess === true ? 'true' : undefined);
    expect(fixture.values.get('unrelated-preference')).toBe('keep');
    expect(fixture.invoke).toHaveBeenCalledWith({action: 'recover_personal_identity', ...request}, expect.any(String));
  });
});
