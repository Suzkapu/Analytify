import {describe, expect, it} from 'vitest';
import {describeEdgeFunctionError} from './edge-function-error';

describe('describeEdgeFunctionError', () => {
  it('returns the safe public message and correlation reference', async () => {
    const error = {
      context: new Response(JSON.stringify({
        error: 'Spotify could not verify this connection.',
        code: 'credential_operation_failed',
        correlationId: 'b602883f-f60a-4d45-9524-c0f72662df86'
      }), {status: 409, headers: {'Content-Type': 'application/json'}})
    };

    await expect(describeEdgeFunctionError(error, 'Please try again.')).resolves.toBe(
      'Spotify could not verify this connection. (reference b602883f-f60a-4d45-9524-c0f72662df86)'
    );
  });

  it('uses a stable fallback for generic or malformed gateway errors', async () => {
    await expect(describeEdgeFunctionError(
      {message: 'Edge Function returned a non-2xx status code'},
      'Cloud setup failed. Please try again.'
    )).resolves.toBe('Cloud setup failed. Please try again.');
  });
});
