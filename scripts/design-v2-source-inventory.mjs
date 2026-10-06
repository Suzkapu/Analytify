import {existsSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {resolve, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const root = process.cwd();
function filesBelow(dir) {
  return readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() && !['node_modules', '.git'].includes(entry.name)
      ? filesBelow(path) : entry.isFile() ? [path] : [];
  });
}
function declarationOnly(path) {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  return source.statements.every(node => ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)
    || (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly)
    || (ts.isExportDeclaration(node) && node.isTypeOnly));
}
export function productionSourceInventory() {
  const suites = {
    frontend: filesBelow('src').filter(path => /\.(ts|mjs|js)$/.test(path)),
    worker: filesBelow('services/sync-service').filter(path => /\.(js|mjs)$/.test(path)),
    edge: filesBelow('supabase/functions').filter(path => /\.(ts|mjs|js)$/.test(path))
  };
  const inventory = Object.fromEntries(Object.entries(suites).map(([suite, files]) => {
    const exclusions = [];
    const sources = files.filter(path => {
      const reason = /\.(test|spec)\./.test(path) ? 'test source'
        : /\.d\.ts$/.test(path) ? 'declaration file'
        : path === 'src/test-setup.ts' ? 'test environment setup'
        : path.endsWith('.ts') && declarationOnly(path) ? 'type-only source (AST checked)' : null;
      if (reason) exclusions.push({path, reason});
      return !reason;
    });
    return [suite, {sources, exclusions}];
  }));
  return inventory;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summaryPath = process.argv[2] || 'coverage/SpotiFront/coverage-summary.json';
  const summary = existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, 'utf8')) : {};
  const reported = new Set(Object.keys(summary).filter(path => path !== 'total').map(path => relative(root, resolve(path))));
  const inventory = productionSourceInventory();
  Object.assign(inventory.frontend, {
    metrics: summary.total || null,
    sourcesMissingFromReport: inventory.frontend.sources.filter(path => !reported.has(path)),
    reportedSources: inventory.frontend.sources.filter(path => reported.has(path)).length
  });
  const result = {schemaVersion: 1, suites: inventory};
  const output = process.argv[3];
  if (output) writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  for (const [suite, data] of Object.entries(inventory)) {
    console.log(`${suite}: ${data.sources.length} production sources, ${data.exclusions.length} justified non-production/type-only exclusions`);
    if (data.sourcesMissingFromReport) console.log(`  ${data.sourcesMissingFromReport.length} production sources absent from coverage report`);
  }
}

