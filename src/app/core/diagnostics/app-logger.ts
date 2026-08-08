export type AppLogDetails = unknown;

export interface AppLogger {
  log(...values: unknown[]): void;
  info(...values: unknown[]): void;
  debug(...values: unknown[]): void;
  warn(...values: unknown[]): void;
  error(...values: unknown[]): void;
  step(message: string, details?: AppLogDetails): void;
  success(message: string, details?: AppLogDetails): void;
}

type AppLogLevel = 'STEP' | 'INFO' | 'DEBUG' | 'WARN' | 'ERROR' | 'DONE';
type ConsoleMethod = 'log' | 'info' | 'debug' | 'warn' | 'error';

const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
const sensitiveKeyPattern = /(?:access|refresh|provider|spotify)?_?token|authorization|password|secret|cookie|credential|oauth_?code|session/i;
const completedMessagePattern = /\b(?:complete(?:d)?|success(?:ful|fully)?|loaded|restored|saved|synced|refreshed|recreated|updated|ready)\b/i;
let sequence = 0;

function elapsedSeconds(): string {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return `+${Math.max(0, now - startedAt).toFixed(0).padStart(5, '0')}ms`;
}

function cleanScope(scope: string): string {
  return scope.trim().replace(/[^a-z0-9 /_-]/gi, '').slice(0, 36) || 'Application';
}

function redactString(value: string): string {
  return value
    .replace(/([?&](?:code|access_token|refresh_token|provider_token|token|authorization)=)[^&#\s]+/gi, '$1[REDACTED]')
    .replace(/\b(Bearer\s+)[^\s'"`]+/gi, '$1[REDACTED]')
    .replace(/\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, '[REDACTED_JWT]');
}

function sanitize(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined
    };
  }
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  if (depth >= 4) return '[Nested details omitted]';
  seen.add(value);

  if (Array.isArray(value)) {
    const entries = value.slice(0, 25).map(entry => sanitize(entry, depth + 1, seen));
    if (value.length > entries.length) entries.push(`[${value.length - entries.length} more items]`);
    return entries;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = sensitiveKeyPattern.test(key) ? '[REDACTED]' : sanitize(entry, depth + 1, seen);
  }
  return result;
}

function unpack(values: unknown[]): {message: string; details: unknown[]} {
  if (typeof values[0] !== 'string') {
    return {message: 'Event details', details: values.map(value => sanitize(value))};
  }

  const withoutLegacyScope = values[0].replace(/^\s*\[[^\]]+\]\s*/, '');
  const message = redactString(withoutLegacyScope.replace(/\s*:\s*$/, '').trim() || 'Event');
  return {message, details: values.slice(1).map(value => sanitize(value))};
}

function write(scope: string, level: AppLogLevel, method: ConsoleMethod, values: unknown[]): void {
  const entry = String(++sequence).padStart(4, '0');
  const {message, details} = unpack(values);
  const prefix = `[Analytify][${entry}][${elapsedSeconds()}][${scope}][${level}]`;
  globalThis.console[method](prefix, message, ...details);
}

export function createScopedLogger(rawScope: string): AppLogger {
  const scope = cleanScope(rawScope);
  return {
    log: (...values) => {
      const message = typeof values[0] === 'string' ? values[0] : '';
      write(scope, completedMessagePattern.test(message) ? 'DONE' : 'STEP', 'log', values);
    },
    info: (...values) => write(scope, 'INFO', 'info', values),
    debug: (...values) => write(scope, 'DEBUG', 'debug', values),
    warn: (...values) => write(scope, 'WARN', 'warn', values),
    error: (...values) => write(scope, 'ERROR', 'error', values),
    step: (message, details) => write(scope, 'STEP', 'info', details === undefined ? [message] : [message, details]),
    success: (message, details) => write(scope, 'DONE', 'log', details === undefined ? [message] : [message, details])
  };
}
