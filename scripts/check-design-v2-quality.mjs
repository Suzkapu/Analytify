import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

function filesBelow(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

const roots = [
  'src/app/features/library/design-v2',
  'src/app/shared/ambient',
  'src/app/shared/layout/design-v2-shell',
  'src/app/shared/ui-v2',
  'src/app/core/navigation'
];
const behavioralSources = roots.flatMap(filesBelow).filter(path =>
  path.endsWith('.ts')
  && !path.endsWith('.spec.ts')
  && !path.endsWith('/index.ts')
  && !path.endsWith('.module.ts')
  && (path.includes('design-v2') || path.includes('/ambient/'))
);
const missingSpecs = behavioralSources.filter(path => !existsSync(path.replace(/\.ts$/, '.spec.ts')));
if (missingSpecs.length) {
  throw new Error(`Design v2 behavior is missing unit coverage:\n${missingSpecs.map(path => `- ${path}`).join('\n')}`);
}

const featureFiles = filesBelow('src/app/features').filter(path =>
  /\.(?:ts|html)$/.test(path) && !path.endsWith('.spec.ts')
);
const hardcodedNamespace = featureFiles.filter(path => /['"`]\/new(?:\/|['"`])/.test(readFileSync(path, 'utf8')));
if (hardcodedNamespace.length) {
  throw new Error(`Feature code contains hardcoded /new routes:\n${hardcodedNamespace.map(path => `- ${path}`).join('\n')}`);
}

const router = readFileSync('src/app/app-routing.module.ts', 'utf8');
if (!router.includes('enableViewTransitions: true')) {
  throw new Error('Angular native route View Transitions must remain enabled.');
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
for (const gate of ['design-v2-parity:check', 'design-v2-quality:check', 'accessibility:browser', 'build:production']) {
  if (!packageJson.scripts[gate]) throw new Error(`Missing Design v2 release gate: ${gate}.`);
}

console.log(`Design v2 quality contracts cover ${behavioralSources.length} behavioral sources and route isolation.`);

