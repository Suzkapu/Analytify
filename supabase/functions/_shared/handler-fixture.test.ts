/** Isolated handler fixture: all transport is intercepted before importing handlers.
 * No environment values, sockets, hosted services or notifications are accessed. */
import assert from 'node:assert/strict';
export const userId = '11111111-1111-4111-8111-111111111111';
export const leagueId = '22222222-2222-4222-8222-222222222222';
export const otherId = '33333333-3333-4333-8333-333333333333';
export const origin = 'https://analytify.dynv6.net';
export const encryptionKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(17)));
export const fixtureEnvironment: Record<string, string> = {
  SUPABASE_URL: 'https://supabase.fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key',
  SPOTIFY_CLIENT_ID: 'a'.repeat(32), SPOTIFY_CLIENT_SECRET: 'fixture-client-secret',
  RATE_LIMIT_HASH_KEY: 'fixture-rate-limit-key-never-production-123', SPOTIFY_TOKEN_ENCRYPTION_KEY: encryptionKey,
  WEB_PUSH_VAPID_PUBLIC_KEY: 'fixture-public', WEB_PUSH_VAPID_PRIVATE_KEY: 'fixture-private'
};
export type Call = {url: URL; method: string; body: any; headers: Headers};
export type Reply = {status?: number; body?: any; headers?: Record<string, string>} | Response;
export type Fixture = {
  env?: Record<string, string | undefined>;
  reply?: (call: Call, calls: Call[]) => Reply | undefined | Promise<Reply | undefined>;
};
const handlers = new Map<string, (request: Request) => Promise<Response>>();
export async function invoke(name: 'credentials' | 'sync' | 'notifications', body: any, fixture: Fixture = {}, options: {method?: string; token?: string | null; origin?: string | null; headers?: Record<string, string>} = {}) {
  const originals = {fetch: globalThis.fetch, env: Deno.env.get, serve: Deno.serve, error: console.error};
  const calls: Call[] = [];
  const errors: unknown[][] = [];
  const unconfigured: string[] = [];
  Deno.env.get = (key: string) => ({...fixtureEnvironment, ...fixture.env})[key];
  console.error = (...values: unknown[]) => { errors.push(values); };
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url || String(input));
    const rawBody = init?.body ?? (request ? await request.text() : undefined);
    let parsed: any = rawBody instanceof URLSearchParams ? Object.fromEntries(rawBody) : rawBody;
    if (typeof rawBody === 'string') { try { parsed = JSON.parse(rawBody); } catch { parsed = Object.fromEntries(new URLSearchParams(rawBody)); } }
    const call = {url, method: init?.method || request?.method || 'GET', body: parsed, headers: new Headers(init?.headers || request?.headers)};
    calls.push(call);
    let reply = await fixture.reply?.(call, calls);
    if (!reply && url.hostname === 'supabase.fixture.invalid' && url.pathname === '/rest/v1/rpc/consume_edge_request_limit') reply = {body: {allowed: true}};
    if (!reply && url.hostname === 'supabase.fixture.invalid' && url.pathname === '/auth/v1/user') reply = {body: {id: userId, email: 'fixture@example.invalid', is_anonymous: false}};
    if (!reply) {unconfigured.push(`${call.method} ${url}`); throw new Error(`Unconfigured isolated transport: ${call.method} ${url}`);}
    return reply instanceof Response ? reply : new Response(JSON.stringify(reply.body ?? null), {status: reply.status ?? 200, headers: {'content-type': 'application/json', ...reply.headers}});
  }) as typeof fetch;
  try {
    if (!handlers.has(name)) {
      Deno.serve = ((handler: (request: Request) => Promise<Response>) => { handlers.set(name, handler); return {} as Deno.HttpServer; }) as typeof Deno.serve;
      if (name === 'credentials') await import('../spotify-credentials/index.ts');
      else if (name === 'sync') await import('../song-league-playlist-sync/index.ts');
      else await import('../song-league-notifications/index.ts');
      assert.ok(handlers.has(name), 'Production handler must register through Deno.serve');
    }
    const method = options.method || 'POST';
    const headers: Record<string, string> = {'content-type': 'application/json', ...options.headers};
    if (options.origin !== null) headers.origin = options.origin || origin;
    if (options.token !== null) headers.authorization = `Bearer ${options.token || 'fixture-user-token'}`;
    const response = await handlers.get(name)!(new Request('https://edge.fixture.invalid', {method, headers, ...(!['GET', 'OPTIONS'].includes(method) ? {body: JSON.stringify(body)} : {})}));
    const value = response.status === 204 ? null : await response.json();
    assert.deepEqual(unconfigured, [], 'Every handler service boundary must have an explicit isolated fixture');
    return {response, value, calls, errors};
  } finally { globalThis.fetch = originals.fetch; Deno.env.get = originals.env; Deno.serve = originals.serve; console.error = originals.error; }
}
