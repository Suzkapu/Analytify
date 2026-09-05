export type BoundedFetchOptions = {
  timeoutMs?: number;
  maxAttempts?: number;
  elapsedBudgetMs?: number;
  retryUnsafe?: boolean;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
};

const transient = new Set([408, 425, 429, 500, 502, 503, 504]);
const idempotent = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']);

export class BoundedFetchError extends Error {
  constructor(message: string, public kind: 'timeout' | 'cancelled' | 'transient' | 'retry_exhausted', options?: ErrorOptions) {
    super(message, options);
  }
}

function retryAfter(response: Response, now: number): number | null {
  const value = response.headers.get('retry-after');
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

export async function boundedFetch(input: string | URL | Request, init: RequestInit = {}, options: BoundedFetchOptions = {}): Promise<Response> {
  const fetchImpl = options.fetchImpl || fetch;
  const sleep = options.sleep || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const random = options.random || Math.random;
  const now = options.now || Date.now;
  const timeoutMs = options.timeoutMs || 15_000;
  const maxAttempts = options.maxAttempts || 3;
  const budgetMs = options.elapsedBudgetMs || 40_000;
  const method = String(init.method || 'GET').toUpperCase();
  const canRetry = idempotent.has(method) || options.retryUnsafe === true;
  const startedAt = now();
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    if (init.signal?.aborted) throw new BoundedFetchError('Request was cancelled.', 'cancelled');
    const cancel = () => controller.abort(init.signal?.reason);
    init.signal?.addEventListener('abort', cancel, {once: true});
    const timer = setTimeout(() => controller.abort(new Error('deadline exceeded')), timeoutMs);
    try {
      const response = await fetchImpl(input, {...init, signal: controller.signal});
      if (!transient.has(response.status) || !canRetry || attempt === maxAttempts) return response;
      lastError = new BoundedFetchError(`Transient HTTP ${response.status}.`, 'transient');
      const base = Math.min(10_000, 500 * (2 ** (attempt - 1)));
      const delay = retryAfter(response, now()) ?? Math.round(base * (0.75 + random() * 0.5));
      if (now() - startedAt + delay > budgetMs) throw new BoundedFetchError('Retry budget was exhausted.', 'retry_exhausted', {cause: lastError});
      await sleep(delay);
    } catch (error) {
      if (error instanceof BoundedFetchError) throw error;
      if (init.signal?.aborted) throw new BoundedFetchError('Request was cancelled.', 'cancelled', {cause: error});
      lastError = new BoundedFetchError(
        controller.signal.aborted ? `Request timed out after ${timeoutMs}ms.` : 'Transient network failure.',
        controller.signal.aborted ? 'timeout' : 'transient', {cause: error}
      );
      if (!canRetry || attempt === maxAttempts) throw lastError;
      const delay = Math.round(Math.min(10_000, 500 * (2 ** (attempt - 1))) * (0.75 + random() * 0.5));
      if (now() - startedAt + delay > budgetMs) throw new BoundedFetchError('Retry budget was exhausted.', 'retry_exhausted', {cause: lastError});
      await sleep(delay);
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', cancel);
    }
  }
  throw lastError;
}
