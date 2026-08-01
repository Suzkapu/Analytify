import {readdirSync, readFileSync} from 'node:fs';
import {dirname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = join(projectRoot, 'src', 'app');

function collectTypeScriptFiles(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectTypeScriptFiles(path);
    }
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

function resolveAppImport(importer, specifier) {
  if (specifier.startsWith('@core/')) {
    return join(appRoot, 'core', specifier.slice('@core/'.length));
  }
  if (specifier.startsWith('@shared/')) {
    return join(appRoot, 'shared', specifier.slice('@shared/'.length));
  }
  if (specifier.startsWith('@features/')) {
    return join(appRoot, 'features', specifier.slice('@features/'.length));
  }
  if (specifier.startsWith('.')) {
    return resolve(dirname(importer), specifier);
  }
  return null;
}

function getLayer(path) {
  const [layer, domain] = relative(appRoot, path).split(sep);
  return {layer, domain};
}

const violations = [];
const importPattern = /(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g;

for (const file of collectTypeScriptFiles(appRoot)) {
  const source = readFileSync(file, 'utf8');
  const importer = getLayer(file);

  for (const match of source.matchAll(importPattern)) {
    const importedPath = resolveAppImport(file, match[1]);
    if (!importedPath) {
      continue;
    }

    const imported = getLayer(importedPath);
    const fileLabel = relative(projectRoot, file);

    if (importer.layer === 'core' && ['features', 'shared'].includes(imported.layer)) {
      violations.push(`${fileLabel}: core cannot import ${imported.layer} (${match[1]})`);
    }

    if (importer.layer === 'shared' && imported.layer === 'features') {
      violations.push(`${fileLabel}: shared cannot import a feature (${match[1]})`);
    }

    if (
      importer.layer === 'features' &&
      imported.layer === 'features' &&
      importer.domain !== imported.domain
    ) {
      violations.push(
        `${fileLabel}: feature ${importer.domain} cannot import feature ${imported.domain} (${match[1]})`
      );
    }
  }
}

if (violations.length > 0) {
  console.error('Architecture boundary violations:\n');
  console.error(violations.map(violation => `- ${violation}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Architecture boundaries are valid.');
}
