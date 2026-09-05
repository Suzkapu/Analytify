const exactPushHosts = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com'
]);

export function normalizedPushEndpoint(value: string): URL {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error('The push endpoint is not a valid URL.');
  }
  const hostname = endpoint.hostname.toLowerCase();
  const windowsPushHost = hostname === 'notify.windows.com' || hostname.endsWith('.notify.windows.com');
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.port
    || (!exactPushHosts.has(hostname) && !windowsPushHost)) {
    throw new Error('The push endpoint is not an approved browser push provider.');
  }
  endpoint.hostname = hostname;
  endpoint.hash = '';
  return endpoint;
}
