import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium, firefox, webkit} from '@playwright/test';

const bundled = await build({stdin: {contents: `import '@angular/compiler';
import {Injector, runInInjectionContext} from '@angular/core';
import {SpotifyAuthService} from './src/app/core/auth/spotify-auth.service';
import {SessionLifecycleService} from './src/app/core/auth/session-lifecycle.service';
import {StorageService} from './src/app/core/data-access/storage/storage.service';
import {DesignV2MobileShortcutPreferencesService} from './src/app/core/navigation/design-v2-mobile-shortcut-preferences.service';
globalThis.createPreferenceOwner = (initialActor) => {
 let actor = initialActor;
 const lifecycle = new SessionLifecycleService();
 let cloudCalls = 0;
 const storage = new StorageService({saveUserCache: () => {cloudCalls++;}, loadUserCache: () => {cloudCalls++;}}, lifecycle);
 const injector = Injector.create({providers: [
 {provide: SpotifyAuthService, useValue: {getUserId: () => actor}},
 {provide: SessionLifecycleService, useValue: lifecycle}, {provide: StorageService, useValue: storage}]});
 const service = runInInjectionContext(injector, () => new DesignV2MobileShortcutPreferencesService());
 return {service, storage, lifecycle, setActor: value => {actor = value;}, cloudCalls: () => cloudCalls};
};`, resolveDir: process.cwd(), sourcefile: 'shortcut-owner-boundary.ts', loader: 'ts'},
 bundle: true, write: false, platform: 'browser', format: 'iife', tsconfig: 'tsconfig.json'});
const results = [];
for (const [name, engine] of [['chromium',chromium],['firefox',firefox],['webkit',webkit]]) {
 const browser = await engine.launch(name === 'webkit' && process.env.ANALYTIFY_TEST_WEBKIT_EXECUTABLE
   ? {executablePath: process.env.ANALYTIFY_TEST_WEBKIT_EXECUTABLE} : {});
 try {
  const context = await browser.newContext(); const page = await context.newPage();
  const errors = []; const unexpected = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
   if (route.request().url() === 'https://shortcut-owner.invalid/') return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated shortcut owner</title>'});
   unexpected.push(route.request().url()); return route.abort();
  });
  await page.goto('https://shortcut-owner.invalid/'); await page.addScriptTag({content:bundled.outputFiles[0].text});
  const outcomes = await page.evaluate(async () => {
   const owner = globalThis.createPreferenceOwner('synthetic-A'); const service = owner.service;
   await service.load(); const defaults = [...service.selection()];
   const pending = service.toggle('playlists'); const immediateSelection = [...service.selection()];
   const pendingBusy = service.saving(); await pending;
   await service.toggle('stats'); await service.toggle('history');
   const reopened = globalThis.createPreferenceOwner('synthetic-A'); await reopened.service.load();
   const zeroAfterReopen = [...reopened.service.selection()];
   const transaction = IDBDatabase.prototype.transaction;
   IDBDatabase.prototype.transaction = function(...args) {
    const tx = Reflect.apply(transaction,this,args); if(args[1]==='readwrite') queueMicrotask(() => tx.abort()); return tx;
   };
   try {await service.toggle('friends');} finally {IDBDatabase.prototype.transaction = transaction;}
   const rolledBackSelection = [...service.selection()]; const failedFeedback = service.feedback();
   await service.retry();
   const retryReopened = globalThis.createPreferenceOwner('synthetic-A'); await retryReopened.service.load();
   const retryAfterReopen = [...retryReopened.service.selection()];
   owner.setActor('synthetic-B'); await service.load(); const replacementDefaults = [...service.selection()];
   await service.toggle('stats');
   const accountA = globalThis.createPreferenceOwner('synthetic-A'); await accountA.service.load();
   const accountB = globalThis.createPreferenceOwner('synthetic-B'); await accountB.service.load();
   const failedRead = globalThis.createPreferenceOwner('synthetic-C');
   IDBDatabase.prototype.transaction = function(...args) {
    const tx = Reflect.apply(transaction,this,args); if(args[1]==='readonly') queueMicrotask(() => tx.abort()); return tx;
   };
   try {await failedRead.service.load();} finally {IDBDatabase.prototype.transaction = transaction;}
   const readFailure = {selection: failedRead.service.selection(), feedback: failedRead.service.feedback()};
   await failedRead.service.retry();
   return {defaults, immediateSelection, pendingBusy, zeroAfterReopen, rolledBackSelection, failedFeedback,
    retryAfterReopen, replacementDefaults, accountA: accountA.service.selection(), accountB: accountB.service.selection(),
    readFailure, recoveredRead: failedRead.service.selection(), cloudCalls: owner.cloudCalls() + reopened.cloudCalls() + retryReopened.cloudCalls() + accountA.cloudCalls() + accountB.cloudCalls() + failedRead.cloudCalls()};
  });
  assert.deepEqual(outcomes,{defaults:['playlists','stats','history'],immediateSelection:['stats','history'],pendingBusy:true,
   zeroAfterReopen:[],rolledBackSelection:[],failedFeedback:'save-error',retryAfterReopen:['friends'],replacementDefaults:['playlists','stats','history'],
   accountA:['friends'],accountB:['playlists','history'],readFailure:{selection:null,feedback:'load-error'},recoveredRead:['playlists','stats','history'],cloudCalls:0});
  assert.deepEqual(errors,[]); assert.deepEqual(unexpected,[]);
  results.push({browser:name,outcomes,errors,unexpected}); console.log(`${name}: real preference owner/storage reopen, rollback/retry and account separation passed`);
  await context.close();
 } finally {await browser.close();}
}
if(process.env.ANALYTIFY_SHORTCUT_EVIDENCE_PATH) {
 const paths=['src/app/core/navigation/design-v2-mobile-shortcut-preferences.service.ts','src/app/core/navigation/mobile-shortcut-policy.ts','src/app/core/data-access/storage/storage.service.ts','scripts/test-shortcut-preferences-browser.mjs'];
 const sourceHashes = Object.fromEntries(await Promise.all(paths.map(async p => [p,createHash('sha256').update(await readFile(p)).digest('hex')])));
 await writeFile(process.env.ANALYTIFY_SHORTCUT_EVIDENCE_PATH,JSON.stringify({exitCode:0,results,sourceHashes,limitations:['Isolated synthetic origin and native IndexedDB; no production data or remote services.','Owner/storage composition only; mounted Navigation/Friends and full responsive shell parity remain open.']},null,2)+'\n');
}
