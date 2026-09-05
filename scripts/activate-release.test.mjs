import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const activation = readFileSync(new URL('./activate-release.sh', import.meta.url), 'utf8');
const service = readFileSync(
  new URL('../deploy/analytify-sync.service.template', import.meta.url),
  'utf8'
);

test('worker activation allows slow credential migration and reports service failures', () => {
  assert.match(activation, /for _attempt in \$\(seq 1 30\)/);
  assert.match(activation, /systemctl status analytify-sync\.service --no-pager --full/);
  assert.match(activation, /journalctl -u analytify-sync\.service --no-pager -n 80/);
});

test('worker keeps home directories private and deploys from var lib', () => {
  const deploy = readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');
  assert.match(service, /^ProtectHome=true$/m);
  assert.match(deploy, /worker_root="\/var\/lib\/analytify-sync"/);
  assert.match(deploy, /sudo -n install -d -o '\$\{DEPLOY_USER\}' -m 0750/);
});
