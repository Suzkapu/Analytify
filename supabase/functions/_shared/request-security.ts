export const MAX_AUTHORIZATION_BYTES = 8192;
export const DEFAULT_MAX_BODY_BYTES = 16 * 1024;

export type RequestContext = {
  correlationId: string;
  corsHeaders: Record<string, string>;
  originAllowed: boolean;
  origin: string | null;
};

export type RateLimitClient = {
  rpc(name: string, parameters: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: {message?: string} | null;
  }>;
};

export class PublicRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
  }
}

function configuredOrigins(): Set<string> {
  const configured = environment('EDGE_ALLOWED_ORIGINS') || [
    'https://analytify.dynv6.net',
    'http://localhost:4200',
    'http://127.0.0.1:4200'
  ].join(',');
  return new Set(configured.split(',').map(value => value.trim()).filter(Boolean));
}

function environment(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

export function requestContext(request: Request, correlationId: string = crypto.randomUUID()): RequestContext {
  const origin = request.headers.get('Origin')?.trim() || null;
  const originAllowed = !origin || configuredOrigins().has(origin);
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'X-Correlation-ID': correlationId
  };
  if (originAllowed && origin) corsHeaders['Access-Control-Allow-Origin'] = origin;
  return {correlationId, corsHeaders, originAllowed, origin};
}

export function publicJson(
  context: RequestContext,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...context.corsHeaders,
      ...extraHeaders,
      'Content-Type': 'application/json',
      'X-Analytify-Commit': environment('DEPLOYMENT_COMMIT_SHA') || 'development'
    }
  });
}

export function publicError(context: RequestContext, error: PublicRequestError): Response {
  const extraHeaders: Record<string, string> = {};
  if (error.retryAfterSeconds) extraHeaders['Retry-After'] = String(error.retryAfterSeconds);
  return publicJson(context, {
    error: error.message,
    code: error.code,
    correlationId: context.correlationId
  }, error.status, extraHeaders);
}

export function requireAllowedOrigin(context: RequestContext, allowMissing = false): void {
  if (!context.originAllowed || (!allowMissing && !context.origin)) {
    throw new PublicRequestError(403, 'origin_not_allowed', 'This website is not allowed to call Analytify.');
  }
}

export function validatePreflight(request: Request, context: RequestContext): void {
  requireAllowedOrigin(context);
  const method = request.headers.get('Access-Control-Request-Method')?.toUpperCase();
  if (method && method !== 'POST') {
    throw new PublicRequestError(405, 'method_not_allowed', 'Only POST requests are supported.');
  }
  const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') || '')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const allowedHeaders = new Set(['authorization', 'x-client-info', 'apikey', 'content-type']);
  if (requestedHeaders.some(value => !allowedHeaders.has(value))) {
    throw new PublicRequestError(403, 'headers_not_allowed', 'The requested headers are not allowed.');
  }
}

export function bearerToken(request: Request): string {
  const authorization = request.headers.get('Authorization') || '';
  if (new TextEncoder().encode(authorization).byteLength > MAX_AUTHORIZATION_BYTES) {
    throw new PublicRequestError(431, 'authorization_too_large', 'The authentication header is too large.');
  }
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/i.exec(authorization);
  if (!match) throw new PublicRequestError(401, 'authentication_required', 'Authentication is required.');
  return match[1];
}

export function isTrustedServiceToken(presented: string, serviceRoleKey: string): boolean {
  return presented.length > 0 && presented === serviceRoleKey;
}

export async function boundedJsonBody(
  request: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES
): Promise<Record<string, unknown>> {
  const encoding = request.headers.get('Content-Encoding')?.trim().toLowerCase();
  if (encoding && encoding !== 'identity') {
    throw new PublicRequestError(415, 'encoding_not_supported', 'Compressed request bodies are not supported.');
  }
  const contentType = request.headers.get('Content-Type')?.trim().toLowerCase() || '';
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/.test(contentType)) {
    throw new PublicRequestError(415, 'content_type_not_supported', 'The request body must use application/json.');
  }
  const declaredHeader = request.headers.get('Content-Length');
  const declaredLength = declaredHeader === null ? null : Number(declaredHeader);
  if (declaredLength !== null && (!Number.isSafeInteger(declaredLength) || declaredLength < 0)) {
    throw new PublicRequestError(400, 'invalid_content_length', 'The request length is invalid.');
  }
  if (declaredLength !== null && declaredLength > maxBytes) {
    throw new PublicRequestError(413, 'request_too_large', 'The request is too large.');
  }
  if (!request.body) return {};

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('request too large');
        throw new PublicRequestError(413, 'request_too_large', 'The request is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!total) return {};
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const parsed = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('object required');
    return parsed as Record<string, unknown>;
  } catch {
    throw new PublicRequestError(400, 'invalid_json', 'The request body must be a JSON object.');
  }
}

function clientAddress(request: Request): string {
  const value = request.headers.get('cf-connecting-ip')?.trim();
  if (value && value.length <= 128) return value;
  return 'address-unavailable';
}

async function hmacSha256(value: string, configuredKey?: string): Promise<string> {
  const secret = configuredKey || environment('RATE_LIMIT_HASH_KEY') || '';
  if (secret.length < 32) throw new Error('RATE_LIMIT_HASH_KEY is not configured securely.');
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function enforceRateLimit(
  client: RateLimitClient,
  request: Request,
  scope: string,
  subject: string | null,
  limit: number,
  windowSeconds: number,
  hashKey?: string
): Promise<void> {
  const tokenHint = request.headers.get('Authorization') || 'no-authorization';
  const address = clientAddress(request);
  const identity = subject
    ? `subject:${subject}`
    : address === 'address-unavailable'
      ? `client:${address}:${tokenHint}`
      : `client:${address}`;
  const bucket = `${scope}:${await hmacSha256(identity, hashKey)}`;
  const {data, error} = await client.rpc('consume_edge_request_limit', {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds
  });
  if (error) throw new Error(`rate limit storage failed: ${error.message || 'unknown error'}`);
  const result = Array.isArray(data) ? data[0] : data;
  if (!(result as {allowed?: boolean} | null)?.allowed) {
    const retryAfter = Math.max(1, Number((result as {retry_after_seconds?: number} | null)?.retry_after_seconds || 1));
    throw new PublicRequestError(429, 'rate_limited', 'Too many requests. Please try again later.', retryAfter);
  }
}

export function logInternalError(context: RequestContext, operation: string, error: unknown): void {
  console.error(`[${context.correlationId}] ${operation} failed`, error);
}
