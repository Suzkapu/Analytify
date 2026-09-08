import assert from 'node:assert/strict';
import {
  bearerToken,
  boundedJsonBody,
  enforceRateLimit,
  isTrustedServiceToken,
  PublicRequestError,
  publicError,
  requestContext,
  requireAllowedOrigin,
  validatePreflight
} from './request-security.ts';

Deno.test('CORS reflects only an explicitly allowed origin', () => {
  const allowed = requestContext(new Request('https://edge.test', {headers: {Origin: 'https://analytify.dynv6.net'}}), 'one');
  assert.equal(allowed.corsHeaders['Access-Control-Allow-Origin'], 'https://analytify.dynv6.net');
  const denied = requestContext(new Request('https://edge.test', {headers: {Origin: 'https://evil.example'}}), 'two');
  assert.throws(() => requireAllowedOrigin(denied), (error: unknown) =>
    error instanceof PublicRequestError && error.code === 'origin_not_allowed');
  assert.equal(denied.corsHeaders['Access-Control-Allow-Origin'], undefined);
  assert.throws(() => requireAllowedOrigin(requestContext(new Request('https://edge.test'), 'three')),
    (error: unknown) => error instanceof PublicRequestError && error.code === 'origin_not_allowed');
});

Deno.test('preflight rejects unsupported methods and headers', () => {
  const request = new Request('https://edge.test', {method: 'OPTIONS', headers: {
    Origin: 'https://analytify.dynv6.net',
    'Access-Control-Request-Method': 'DELETE'
  }});
  assert.throws(() => validatePreflight(request, requestContext(request)),
    (error: unknown) => error instanceof PublicRequestError && error.code === 'method_not_allowed');
});

Deno.test('streaming JSON parsing rejects undeclared oversized bodies', async () => {
  const request = new Request('https://edge.test', {method: 'POST', headers: {
    'Content-Type': 'application/json'
  }, body: JSON.stringify({value: 'x'.repeat(100)})});
  await assert.rejects(() => boundedJsonBody(request, 32), (error: unknown) =>
    error instanceof PublicRequestError && error.status === 413);
});

Deno.test('JSON parsing rejects arrays and malformed bodies with a stable error', async () => {
  await assert.rejects(
    () => boundedJsonBody(new Request('https://edge.test', {method: 'POST', headers: {
      'Content-Type': 'application/json'
    }, body: '[]'})),
    (error: unknown) => error instanceof PublicRequestError && error.code === 'invalid_json'
  );
});

Deno.test('bearer tokens have a strict size and syntax bound', () => {
  assert.equal(bearerToken(new Request('https://edge.test', {headers: {Authorization: 'Bearer token'}})), 'token');
  assert.throws(
    () => bearerToken(new Request('https://edge.test', {headers: {Authorization: `Bearer ${'x'.repeat(9000)}`}})),
    (error: unknown) => error instanceof PublicRequestError && error.code === 'authorization_too_large'
  );
});

Deno.test('worker access requires the exact service secret, not an unsigned role claim', () => {
  const forgedPayload = btoa(JSON.stringify({role: 'service_role'}))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const forgedJwt = `header.${forgedPayload}.signature`;
  assert.equal(isTrustedServiceToken(forgedJwt, 'real-service-role-secret'), false);
  assert.equal(isTrustedServiceToken('real-service-role-secret', 'real-service-role-secret'), true);
});

Deno.test('request bodies reject compressed or ambiguous media types before parsing', async () => {
  await assert.rejects(() => boundedJsonBody(new Request('https://edge.test', {method: 'POST', headers: {
    'Content-Type': 'text/plain', 'Content-Encoding': 'gzip'
  }, body: '{}'})), (error: unknown) => error instanceof PublicRequestError && error.status === 415);
});

Deno.test('durable limits count calls and expose only a bounded retry delay', async () => {
  const calls: Record<string, unknown>[] = [];
  const client = {rpc: (_name: string, parameters: Record<string, unknown>) => {
    calls.push(parameters);
    return Promise.resolve({data: [{allowed: false, retry_after_seconds: 12}], error: null});
  }};
  await assert.rejects(
    () => enforceRateLimit(client, new Request('https://edge.test', {
      headers: {Authorization: 'Bearer invalid', 'cf-connecting-ip': '192.0.2.4'}
    }), 'credentials:ip', null, 5, 60, 'test-rate-limit-key-at-least-32-bytes'),
    (error: unknown) => error instanceof PublicRequestError && error.code === 'rate_limited' && error.retryAfterSeconds === 12
  );
  assert.equal(calls.length, 1);
  assert.match(String(calls[0].p_bucket), /^credentials:ip:[a-f0-9]{64}$/);
  assert.doesNotMatch(String(calls[0].p_bucket), /192\.0\.2\.4|invalid/);
});

Deno.test('public failures contain correlation IDs but not internal details', async () => {
  const context = requestContext(new Request('https://edge.test'), 'correlation-test');
  const response = publicError(context, new PublicRequestError(500, 'operation_failed', 'Please try again.'));
  assert.deepEqual(await response.json(), {
    error: 'Please try again.', code: 'operation_failed', correlationId: 'correlation-test'
  });
  assert.equal(response.headers.get('X-Correlation-ID'), 'correlation-test');
});
