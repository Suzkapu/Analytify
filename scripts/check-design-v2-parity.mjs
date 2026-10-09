import {readFileSync} from 'node:fs';

const matrix = readFileSync(new URL('../docs/design-v2-ui-parity-matrix.md', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../src/app/shared/layout/design-v2-shell/design-v2-shell.component.html', import.meta.url), 'utf8');
const shellController = readFileSync(new URL('../src/app/shared/layout/design-v2-shell/design-v2-shell.component.ts', import.meta.url), 'utf8');
if (/blocked users|openBlockedUsers/i.test(shell) || /openBlockedUsers|blocked-users-dialog/.test(shellController)) {
  throw new Error('Design v2 shell restores intentionally excluded blocked-user management.');
}
if (!matrix.includes('Blocked Users management and admin runtime health are intentionally excluded')) {
  throw new Error('Design v2 parity inventory must record the current intentional exclusions.');
}

const sourceFiles = [
  '../src/app/features/library/design-v2/v2-playlists-page.component.ts',
  '../src/app/features/library/design-v2/v2-songs-page.component.ts',
  '../src/app/features/library/design-v2/v2-artist-details-page.component.ts',
  '../src/app/features/library/design-v2/v2-analysis-page.component.ts',
  '../src/app/features/insights/user-stats/v2-user-stats.component.ts',
  '../src/app/features/insights/listening-history/v2-listening-history.component.ts'
].map(path => readFileSync(new URL(path, import.meta.url), 'utf8'));

const requiredOwnershipColumns = [
  'Legacy route/component', 'v2 route/component', 'Owner', 'Shell', 'Layout',
  'Shared v2 primitives / native HTML', 'Loading', 'Empty', 'Error',
  'Permission / disabled / required', 'Destructive / confirmation', 'Final status'
];
const requiredVerificationColumns = [
  'Desktop', 'Mobile', '320px / 400% reflow', 'Keyboard', 'Screen reader / ARIA',
  'Axe', 'Unit', 'Browser / E2E', 'Performance', 'Legacy adapter remaining?',
  'Final verification status'
];
for (const heading of [...requiredOwnershipColumns, ...requiredVerificationColumns]) {
  if (!matrix.includes(`| ${heading} `)) throw new Error(`Design v2 parity matrix is missing the ${heading} column.`);
}
for (const section of ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1', 'I1', 'J1', 'K1']) {
  if (!matrix.includes(`| ${section} |`)) throw new Error(`Design v2 parity matrix is missing section ${section}.`);
}
const requiredSurfaceInventory = [
  'initial navigation loading', 'global announcement', 'update prompt', 'skip links',
  'desktop shell', 'mobile shell', 'global overlay', 'persistent ambient renderer',
  'Cloud Backup', 'Automatic Updates', 'Manage Spotify access', 'Clear Data chooser',
  'Terms/Privacy acceptance', 'hosted callback', 'personal Spotify', 'Cloud Access setup',
  'Playlists header', 'Songs context/back', 'Artist profile/header', 'Analysis context/back',
  'Stats/spy header', 'Search past', 'Recently Played header',
  'Share playlist action', 'share claim', 'stats request claim', 'block/report/moderation',
  'public join', 'QR/text alternative', 'public playlist input', 'proposal/approval',
  'league home/list', 'join/claim', 'standings', 'ownership transfer', 'active recommendations',
  'Notifications switches', 'interval editor', 'every Admin section', 'legal shell'
];
for (const surface of requiredSurfaceInventory) {
  if (!matrix.toLowerCase().includes(surface.toLowerCase())) {
    throw new Error(`Design v2 parity matrix is missing the required surface: ${surface}.`);
  }
}
if (/\|\s*(?:Missing|Blocked|TBD)\s*\|/i.test(matrix)) {
  throw new Error('Design v2 parity matrix still contains an unresolved rollout state.');
}
if (/temporary (?:feature )?adapter|approved only until #164|#164 removal gate/i.test(matrix)) {
  throw new Error('Design v2 parity matrix still contains a legacy presentation adapter.');
}
const rendererCount = [shell, ...sourceFiles]
  .reduce((count, source) => count + (source.match(/<app-ambient-background\b/g) ?? []).length, 0);
if (rendererCount !== 1) throw new Error(`Expected one v2 ambient renderer, found ${rendererCount}.`);
console.log('Design v2 UI parity inventory and single-renderer contract are complete.');
