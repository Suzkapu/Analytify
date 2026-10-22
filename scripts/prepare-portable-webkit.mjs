import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {webkit} from '@playwright/test';
import {dirname, resolve} from 'node:path';

// Restore the previously verified runtime without installing host packages.
const recorded = JSON.parse(await readFile('docs/testing-evidence/design-v2/settings-updates-webkit-runtime.json', 'utf8'));
const directory = process.argv[2] ? resolve(process.argv[2]) : '/tmp/analytify-webkit-libs';
if (/[\r\n']/.test(directory)) throw new Error('Unsupported portable runtime directory.');
await mkdir(directory, {recursive: true});
const packages = [];
for (const url of recorded.archiveSources) {
  const filename = url.includes('/icu/') ? 'icu.deb' : url.includes('/flite/') ? 'flite.deb' : 'xml.deb';
  const expected = recorded.packages.find(item => item.path.endsWith('/' + filename)).sha256;
  const path = `${directory}/${filename}`;
  let data;
  try {data = await readFile(path);} catch {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Portable WebKit download failed: ${response.status} ${filename}`);
    data = Buffer.from(await response.arrayBuffer());
  }
  const sha256 = createHash('sha256').update(data).digest('hex');
  if (sha256 !== expected) throw new Error(`Portable WebKit package hash mismatch: ${filename}`);
  await writeFile(path, data);
  const member = execFileSync('ar', ['t', path], {encoding: 'utf8'}).split('\n').find(name => /^data\.tar\.(xz|zst|gz)$/.test(name));
  if (!member) throw new Error(`Missing package data archive: ${filename}`);
  await mkdir(`${directory}/root`, {recursive: true});
  const archive = execFileSync('ar', ['p', path, member], {maxBuffer: 128 * 1024 * 1024});
  const compression = member.endsWith('.zst') ? '--zstd' : member.endsWith('.xz') ? '--xz' : '--gzip';
  execFileSync('tar', [compression, '-x', '-f', '-', '-C', `${directory}/root`], {input: archive});
  packages.push({url, sha256});
}
const executable = webkit.executablePath();
if (executable.includes("'")) throw new Error('Unexpected browser executable path.');
const wrapper = `${directory}/run-webkit.sh`;
// The bundled MiniBrowser wrapper replaces LD_LIBRARY_PATH. Launch the same
// binary with its documented resource paths plus the verified portable libraries.
const bundle = `${dirname(executable)}/minibrowser-wpe`;
await writeFile(wrapper, `#!/bin/sh\nexport WEBKIT_EXEC_PATH='${bundle}/bin'\nexport WEBKIT_INJECTED_BUNDLE_PATH='${bundle}/lib'\nexport WEBKIT_INSPECTOR_RESOURCES_PATH='${bundle}/share'\nexport LD_LIBRARY_PATH='${directory}/root/usr/lib/x86_64-linux-gnu:${bundle}/lib:${bundle}/sys/lib'\nexec '${bundle}/bin/MiniBrowser' \"$@\"\n`, {mode: 0o755});
await writeFile('docs/testing-evidence/design-v2/friends-webkit-runtime.json', JSON.stringify({packages, executable, wrapper, hostPackagesModified: false}, null, 2) + '\n');
console.log(`Verified portable WebKit runtime: ${wrapper}`);
