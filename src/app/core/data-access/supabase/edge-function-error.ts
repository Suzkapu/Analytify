type EdgeErrorBody = {
  error?: unknown;
  correlationId?: unknown;
};

/** Reads only the intentionally public Edge Function error envelope. */
export async function describeEdgeFunctionError(error: unknown, fallback: string): Promise<string> {
  const response = (error as {context?: unknown} | null)?.context as {
    clone?: () => {json?: () => Promise<unknown>};
  } | undefined;
  try {
    const body = await response?.clone?.().json?.() as EdgeErrorBody | undefined;
    const message = typeof body?.error === 'string' && body.error.length <= 500
      ? body.error.trim()
      : '';
    const correlationId = typeof body?.correlationId === 'string' &&
      /^[A-Za-z0-9-]{8,128}$/.test(body.correlationId)
      ? body.correlationId
      : '';
    if (message) return correlationId ? `${message} (reference ${correlationId})` : message;
  } catch {
    // Network failures and non-JSON proxy responses use the stable fallback.
  }
  return fallback;
}
