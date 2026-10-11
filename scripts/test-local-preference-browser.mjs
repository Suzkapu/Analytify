import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium, firefox, webkit} from '@playwright/test';

// Bundle the production class, not a parallel implementation of storage.
const bundled = await build({
  stdin: {
    contents: `import '@angular/compiler';
import {StorageService} from './src/app/core/data-access/storage/storage.service';
import {SessionLifecycleService} from './src/app/core/auth/session-lifecycle.service';
globalThis.storageBoundary = {StorageService, SessionLifecycleService};`,
    resolveDir: process.cwd(), sourcefile: 'local-preference-boundary.ts', loader: 'ts'
  }, bundle: true, write: false, platform: 'browser', format: 'iife', tsconfig: 'tsconfig.json'
});
const results = [];
for (const [name, engine] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]]) {
  const browser = await engine.launch(name === 'webkit' && process.env.ANALYTIFY_TEST_WEBKIT_EXECUTABLE
    ? {executablePath: process.env.ANALYTIFY_TEST_WEBKIT_EXECUTABLE} : {});
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const unexpected = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      if (route.request().url() === 'https://storage-boundary.invalid/') {
        return route.fulfill({contentType: 'text/html', body: '<!doctype html><title>Isolated storage boundary</title>'});
      }
      unexpected.push(route.request().url());
      return route.abort();
    });
    await page.goto('https://storage-boundary.invalid/');
    await page.addScriptTag({content: bundled.outputFiles[0].text});
    const outcomes = await page.evaluate(async () => {
      const {StorageService, SessionLifecycleService} = globalThis.storageBoundary;
      let cloudCalls = 0;
      const cloud = {saveUserCache: () => {cloudCalls++;}, loadUserCache: () => {cloudCalls++;}};
      const lifecycle = new SessionLifecycleService();
      const writer = new StorageService(cloud, lifecycle);
      const key = 'design-v2:mobile-shortcuts:synthetic-owner';
      await writer.setLocalItemDurably(key, '[]');
      const reopened = new StorageService(cloud, new SessionLifecycleService());
      const loaded = await reopened.hydrateItems([key], {readFailure: 'reject'});
      const zeroAfterReopen = reopened.getItem(key);

      // Fault injection uses a real native transaction abort. Subsequent reads
      // and retry run against the same browser's actual IndexedDB engine.
      const originalTransaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) {
        const tx = Reflect.apply(originalTransaction, this, args);
        if (args[1] === 'readwrite') queueMicrotask(() => tx.abort());
        return tx;
      };
      let failure;
      try {await writer.setLocalItemDurably(key, '["stats"]');}
      catch (error) {failure = error.name;}
      finally {IDBDatabase.prototype.transaction = originalTransaction;}
      const afterAbort = new StorageService(cloud, new SessionLifecycleService());
      await afterAbort.hydrateItems([key], {readFailure: 'reject'});
      const diskAfterAbort = afterAbort.getItem(key);
      await writer.setLocalItemDurably(key, '["stats"]');
      const afterRetry = new StorageService(cloud, new SessionLifecycleService());
      await afterRetry.hydrateItems([key], {readFailure: 'reject'});
      const strictReader = new StorageService(cloud, new SessionLifecycleService());
      IDBDatabase.prototype.transaction = function (...args) {
        const tx = Reflect.apply(originalTransaction, this, args);
        if (args[1] === 'readonly') queueMicrotask(() => tx.abort());
        return tx;
      };
      let readFailure;
      try {await strictReader.hydrateItems([key], {readFailure: 'reject'});}
      catch (error) {readFailure = error.name;}
      finally {IDBDatabase.prototype.transaction = originalTransaction;}
      const cachedAfterReadFailure = strictReader.getItem(key);
      const retryLoaded = await strictReader.hydrateItems([key], {readFailure: 'reject'});
      const removalLifecycle = new SessionLifecycleService();
      const removalReader = new StorageService(cloud, removalLifecycle);
      let releaseRead;
      let announceRead;
      const readCompleted = new Promise(resolve => {announceRead = resolve;});
      IDBDatabase.prototype.transaction = function (...args) {
        const tx = Reflect.apply(originalTransaction, this, args);
        if (args[1] === 'readonly') {
          // Hold delivery of the actual native completion event; the disk read
          // itself remains native and completes before removal starts.
          Object.defineProperty(tx, 'oncomplete', {set: handler => {
            tx.addEventListener('complete', event => {
              releaseRead = () => handler.call(tx, event);
              announceRead();
            }, {once: true});
          }});
        }
        return tx;
      };
      const lateRead = removalReader.hydrateItems([key], {readFailure: 'reject'});
      await readCompleted;
      IDBDatabase.prototype.transaction = originalTransaction;
      removalReader.removeItem(key);
      await removalLifecycle.drainCurrent();
      releaseRead();
      const removedReadLoaded = await lateRead;
      const removedReadCache = removalReader.getItem(key);
      const removalReopened = new StorageService(cloud, new SessionLifecycleService());
      await removalReopened.hydrateItems([key], {readFailure: 'reject'});
      const removedDisk = removalReopened.getItem(key);
      return {loaded, zeroAfterReopen, failure, diskAfterAbort, retryAfterReopen: afterRetry.getItem(key), cloudCalls,
        readFailure, cachedAfterReadFailure, retryLoaded, readAfterRetry: strictReader.getItem(key), removedReadLoaded, removedReadCache, removedDisk};
    });
    assert.deepEqual(outcomes, {loaded: 1, zeroAfterReopen: '[]', failure: 'AbortError', diskAfterAbort: '[]', retryAfterReopen: '["stats"]', cloudCalls: 0, readFailure: 'AbortError', cachedAfterReadFailure: null, retryLoaded: 1, readAfterRetry: '["stats"]', removedReadLoaded: 0, removedReadCache: null, removedDisk: null});
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    results.push({browser: name, outcomes, unexpected, errors});
    console.log(`${name}: native IndexedDB reopen, abort/retry and delayed read after removal passed`);
    await context.close();
  } finally {await browser.close();}
}
if (process.env.ANALYTIFY_STORAGE_EVIDENCE_PATH) {
  await writeFile(process.env.ANALYTIFY_STORAGE_EVIDENCE_PATH, JSON.stringify({results, limitations: ['Isolated synthetic origin; no production data or remote services.', 'Storage boundary only; mounted Navigation UI and full browser regression remain separate.']}, null, 2) + '\n');
}
