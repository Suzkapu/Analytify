export const DEFAULT_IO_CONCURRENCY = 4;

/**
 * Runs independent asynchronous work with a small, shared-safe fan-out.
 * Keeping the result index stable lets callers assemble one complete view and
 * commit it once, without exposing request completion order in the UI.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency = DEFAULT_IO_CONCURRENCY
): Promise<R[]> {
  if (items.length === 0) return [];

  const limit = Math.max(1, Math.min(items.length, Math.trunc(concurrency) || 1));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const runWorker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index], index);
    }
  };

  await Promise.all(Array.from({length: limit}, () => runWorker()));
  return results;
}

/**
 * Defers background work until the browser has had a chance to paint the
 * critical view. The timeout guarantees progress on browsers or busy tabs
 * where requestIdleCallback is unavailable or rarely fires.
 */
export function runAfterNextPaint(
  task: () => void,
  timeoutMs = 500
): () => void {
  let cancelled = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let idleId: number | null = null;
  let frameId: number | null = null;

  const run = () => {
    if (cancelled) return;
    cancelled = true;
    if (timeoutId !== null) clearTimeout(timeoutId);
    task();
  };

  timeoutId = setTimeout(run, timeoutMs);
  if (typeof requestAnimationFrame === 'function') {
    frameId = requestAnimationFrame(() => {
      if (cancelled) return;
      if (typeof requestIdleCallback === 'function') {
        idleId = requestIdleCallback(run, {timeout: timeoutMs});
      } else {
        setTimeout(run, 0);
      }
    });
  } else {
    setTimeout(run, 0);
  }

  return () => {
    if (cancelled) return;
    cancelled = true;
    if (timeoutId !== null) clearTimeout(timeoutId);
    if (frameId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(frameId);
    }
    if (idleId !== null && typeof cancelIdleCallback === 'function') {
      cancelIdleCallback(idleId);
    }
  };
}
