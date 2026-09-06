import {readFileSync} from 'node:fs';

const auth = readFileSync('src/app/core/auth/spotify-auth.service.ts', 'utf8');
const edge = readFileSync('supabase/functions/spotify-credentials/index.ts', 'utf8');
const access = readFileSync('src/app/features/auth/personal-spotify/cloud-access.component.ts', 'utf8');

const checks = [
  ['cloud capabilities are modeled independently', auth.includes('interface CloudCapabilities')
    && auth.includes('scheduledSpotifyAccess: boolean')],
  ['minimal collaboration registration does not submit a refresh token', auth.includes("action: 'profile'")
    && edge.indexOf("if (action === 'profile') return") < edge.indexOf('const encrypted = await encryptSpotifyRefreshToken(')],
  ['unattended credentials require an explicit scheduled capability', auth.includes('enableScheduledSpotifyAccess()')
    && auth.includes('hasScheduledSpotifyAccess()')],
  ['encrypted credentials can be deleted without deleting the identity', auth.includes('disableScheduledSpotifyAccess()')
    && edge.includes("action === 'delete_credentials'")],
  ['minimal identity consent explains that listening data and refresh tokens stay local',
    access.includes('does not upload listening data or store a Spotify refresh token')]
];

const failures = checks.filter(([, valid]) => !valid).map(([label]) => label);
if (failures.length) {
  console.error(`Cloud capability checks failed:\n${failures.map(label => `- ${label}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Cloud identity, backup, and scheduled Spotify capabilities are separated.');
}
