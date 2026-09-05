const requiredEnvironment = name => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the live deployment check.`);
  return value;
};

const appUrl = requiredEnvironment('APP_URL').replace(/\/$/, '');
const supabaseUrl = requiredEnvironment('SUPABASE_URL').replace(/\/$/, '');
const publishableKey = requiredEnvironment('SUPABASE_PUBLISHABLE_KEY');
const supabaseHeaders = {
  apikey: publishableKey,
  Authorization: `Bearer ${publishableKey}`,
  'Content-Type': 'application/json'
};

const probes = [
  {
    label: 'Analytify application',
    url: `${appUrl}/`,
    options: {},
    validate: async response => response.ok && (await response.text()).includes('<app-root')
  },
  ...['sync_user_settings', 'spotify_credentials'].map(table => ({
    label: `Supabase ${table} table`,
    url: `${supabaseUrl}/rest/v1/${table}?select=*&limit=0`,
    options: {headers: supabaseHeaders},
    validate: async response => response.status !== 404 && response.status < 500
  })),
  ...['spotify-credentials', 'song-league-playlist-sync'].map(functionName => ({
    label: `Supabase ${functionName} function`,
    url: `${supabaseUrl}/functions/v1/${functionName}`,
    options: {method: 'POST', headers: supabaseHeaders, body: '{}'},
    validate: async response => response.status !== 404 && response.status < 500
  }))
];

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function runProbe(probe) {
  let lastStatus = 'no response';
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('probe deadline exceeded')), 10_000);
    try {
      const response = await fetch(probe.url, {...probe.options, signal: controller.signal});
      lastStatus = response.status;
      if (await probe.validate(response)) return;
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < 5) await wait(2_500 + Math.round(Math.random() * 1_000));
  }
  throw new Error(`${probe.label} failed its live check (last result: ${lastStatus}).`);
}

await Promise.all(probes.map(runProbe));
console.log('Oracle and Supabase live deployment checks passed.');
