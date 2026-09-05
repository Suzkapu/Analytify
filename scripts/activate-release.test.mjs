import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const activation = readFileSync(new URL('./activate-release.sh', import.meta.url), 'utf8');

test('worker activation allows slow credential migration and reports service failures', () => {
  assert.match(activation, /for _attempt in \$\(seq 1 30\)/);
  assert.match(activation, /systemctl status analytify-sync\.service --no-pager --full/);
  assert.match(activation, /journalctl -u analytify-sync\.service --no-pager -n 80/);
});
