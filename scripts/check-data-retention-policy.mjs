import {readFileSync, readdirSync} from 'node:fs';

const inventory = JSON.parse(readFileSync('config/data-retention-inventory.json', 'utf8'));
const docs = readFileSync('docs/data-retention-schedule.md', 'utf8');
const migration = readFileSync('supabase/migrations/20260922190000_complete_data_retention.sql', 'utf8');
const migrationText = readdirSync('supabase/migrations')
  .filter(name => name.endsWith('.sql'))
  .map(name => readFileSync(`supabase/migrations/${name}`, 'utf8'))
  .join('\n');

const failures = [];
const requiredFields = ['id', 'owner', 'purpose', 'retention', 'erasure', 'relations'];
for (const resource of inventory.resources ?? []) {
  for (const field of requiredFields) {
    if (!resource[field] || (Array.isArray(resource[field]) && resource[field].length === 0)) {
      failures.push(`Retention resource ${resource.id ?? '<unknown>'} lacks ${field}.`);
    }
  }
}

const tablePattern = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(public|private)\.)?([a-z][a-z0-9_]*)/gi;
const schemaTables = new Set();
for (const match of migrationText.matchAll(tablePattern)) {
  schemaTables.add(`${match[1] ?? 'public'}.${match[2]}`.toLowerCase());
}
const inventoried = new Set(inventory.resources.flatMap(resource => resource.relations)
  .filter(relation => /^(public|private)\./.test(relation)));
for (const table of schemaTables) if (!inventoried.has(table)) failures.push(`Missing table lifecycle: ${table}`);
for (const table of inventoried) if (!schemaTables.has(table)) failures.push(`Inventory names unknown table: ${table}`);

for (const marker of [
  'create or replace function private.cleanup_data_retention',
  'create or replace function private.run_data_retention_cleanup',
  'create or replace function public.monitor_data_retention_health',
  "'analytify-complete-data-retention'",
  "interval '730 days'",
  "request.status = 'approved'",
  'not exists (select 1 from public.listening_history'
]) {
  if (!migration.includes(marker)) failures.push(`Retention migration lacks safety marker: ${marker}`);
}
for (const marker of ['never auto-deleted', 'no more than 30 days', 'within 48 hours', 'every 90 days']) {
  if (!docs.includes(marker)) failures.push(`Retention documentation lacks: ${marker}`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Retention inventory covers ${schemaTables.size} database tables and ${inventory.resources.length} lifecycle groups.`);
