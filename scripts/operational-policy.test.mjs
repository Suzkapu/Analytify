import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration = readFileSync('supabase/migrations/20260906220000_operational_retention_and_health.sql', 'utf8');

test('operational retention redacts errors before deleting failed records', () => {
  const redact = migration.indexOf("status = 'failed' and finished_at < now() - interval '30 days'");
  const remove = migration.indexOf("status = 'failed' and finished_at < now() - interval '90 days'");
  assert.ok(redact >= 0 && remove > redact);
  assert.match(migration, /status = 'sent'.*interval '30 days'/s);
  assert.match(migration, /status = 'failed'.*interval '90 days'/s);
  assert.match(migration, /set last_error = null[\s\S]*status = 'failed'[\s\S]*interval '30 days'/);
});

test('health alerts cover both backlogs, lease expiry, provider errors, and cooldown', () => {
  for (const signal of ['sync-backlog', 'push-backlog', 'expired-sync-leases', 'push-provider-errors']) {
    assert.ok(migration.includes(signal));
  }
  assert.ok(migration.includes("last_notified_at < v_now - interval '30 minutes'"));
  assert.ok(migration.includes('lastSuccessByFeature'));
  assert.ok(migration.includes('releases'));
  assert.ok(migration.includes('notificationQueueDepth'));
});
