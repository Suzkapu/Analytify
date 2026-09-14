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

test('worker service applies compatible process, kernel, device, and capability confinement', () => {
  for (const directive of [
    'UMask=0077',
    'PrivateDevices=true',
    'ProtectClock=true',
    'ProtectControlGroups=true',
    'ProtectHostname=true',
    'ProtectKernelLogs=true',
    'ProtectKernelModules=true',
    'ProtectKernelTunables=true',
    'ProtectProc=invisible',
    'ProcSubset=pid',
    'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6',
    'RestrictRealtime=true',
    'RestrictSUIDSGID=true',
    'LockPersonality=true',
    'RemoveIPC=true',
    'CapabilityBoundingSet=',
    'AmbientCapabilities=',
    'SystemCallArchitectures=native'
  ]) {
    assert.match(service, new RegExp(`^${directive.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'm'));
  }
  assert.doesNotMatch(service, /^PrivateNetwork=true$/m);
  assert.doesNotMatch(service, /^MemoryDenyWriteExecute=true$/m);
});

test('activation audits the installed worker sandbox after its health check passes', () => {
  const healthCheck = activation.indexOf('if [[ "$worker_ok" != true ]]');
  const sandboxAudit = activation.indexOf('systemd-analyze security --no-pager analytify-sync.service');
  assert.ok(healthCheck >= 0);
  assert.ok(sandboxAudit > healthCheck);
});

test('remote control commands retry transient DNS and transport failures', () => {
  const deploy = readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');
  assert.match(deploy, /remote_command_with_retry\(\)/);
  assert.match(deploy, /for attempt in 1 2 3/);
  assert.match(deploy, /Remote command failed after 3 attempts/);
});
