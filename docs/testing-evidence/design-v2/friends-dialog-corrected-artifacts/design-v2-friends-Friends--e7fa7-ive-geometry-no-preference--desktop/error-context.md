# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-friends.spec.ts >> Friends invitations and responsive geometry (no-preference)
- Location: e2e/design-v2-friends.spec.ts:205:7

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

  Object {
-   "errors": Array [],
+   "errors": Array [
+     "TimeoutError: Transition was aborted because of timeout in DOM update. DOM update timed out",
+   ],
    "pending": 0,
  }

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link "Skip to main content" [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - text:       
  - banner [ref=f1e7]:
    - generic [ref=f1e8]:
      - link "Analytify playlists" [ref=f1e9] [cursor=pointer]:
        - /url: /new/playlists
        - generic [ref=f1e10]: Analytify
      - button "Open navigation menu" [ref=f1e12] [cursor=pointer]:
        - generic [aria-hidden] [ref=f1e13]: 
        - generic [ref=f1e14]: Menu
  - main "Add a friend content" [active] [ref=f1e15]:
    - generic [ref=f1e19]:
      - generic [ref=f1e21]:
        - generic [ref=f1e22]:
          - heading "Add a friend" [level=1] [ref=f1e23]
          - button "Back" [ref=f1e24] [cursor=pointer]
        - paragraph [ref=f1e25]: Share your invitation link or let a friend scan your QR code.
      - generic [ref=f1e26]:
        - navigation "Friends navigation" [ref=f1e27]:
          - link "Friends" [ref=f1e28] [cursor=pointer]:
            - /url: /new/friends
          - link "Invitations" [ref=f1e30] [cursor=pointer]:
            - /url: /new/friends/invitations
        - link "Add friend" [ref=f1e32] [cursor=pointer]:
          - /url: /new/friends/add
        - generic [ref=f1e34]:
          - generic [ref=f1e35]:
            - img "Scan to open this single-person friend invitation" [ref=f1e37]
            - generic [ref=f1e38]:
              - heading "Browser test user" [level=2] [ref=f1e39]
              - paragraph [ref=f1e40]: Scan to add me on Analytify.
          - heading "Your invitation link" [level=2] [ref=f1e41]
          - paragraph [ref=f1e42]: http://127.0.0.1:4214/new/friends/invite/3f52cd93ced445fc0a1f6a7cf37f3e5be1407f021455a54fd80b1980c269cc2a
          - button "Copy link" [ref=f1e43] [cursor=pointer]
          - paragraph [ref=f1e45]: One person · Revoke while pending
  - navigation "Primary navigation" [ref=f1e46]:
    - link "Playlists" [ref=f1e47] [cursor=pointer]:
      - /url: /new/playlists
      - generic [aria-hidden] [ref=f1e48]: 
    - link "Stats" [ref=f1e50] [cursor=pointer]:
      - /url: /new/stats
      - generic [aria-hidden] [ref=f1e51]: 
    - link "History" [ref=f1e53] [cursor=pointer]:
      - /url: /new/history
      - generic [aria-hidden] [ref=f1e54]: 
  - contentinfo [ref=f1e56]:
    - generic [ref=f1e57]: Powered by Spotify
    - generic [ref=f1e58]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e59] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  1  | import {expect, type Page} from '@playwright/test';
  2  | 
  3  | interface TransitionRecord {id: number; stage: string; error?: string;}
  4  | interface TransitionSnapshot {pending: number; starts: number; errors: string[]; records: TransitionRecord[];}
  5  | 
  6  | /** A superseded animation must still complete its DOM callback and finished promise. */
  7  | export function transitionRecovery(snapshot: TransitionSnapshot) {
  8  |   const failed = snapshot.records.filter(record => record.error !== undefined);
  9  |   return {
  10 |     pending: snapshot.pending,
  11 |     missingUpdates: snapshot.starts - snapshot.records.filter(record => record.stage === 'updated').length,
  12 |     missingFinishes: snapshot.starts - snapshot.records.filter(record => record.stage === 'finished').length,
  13 |     unmatchedErrors: snapshot.errors.length - failed.length,
  14 |     unexpectedErrors: failed.filter(record => !(record.stage === 'ready-rejected' && record.id < snapshot.starts
  15 |       && record.error === 'AbortError: Transition was skipped. New ViewTransition started')).map(record => record.error)
  16 |   };
  17 | }
  18 | 
  19 | /** Observe native promises without changing callbacks, animations or return values. */
  20 | export async function observeNativeTransitions(page: Page): Promise<void> {
  21 |   await page.addInitScript(() => {
  22 |     const probe = {pending: 0, starts: 0, errors: [] as string[], records: [] as {id: number; startedUrl: string; stage: string; elapsedMs: number; error?: string}[]};
  23 |     Object.assign(window, {analytifyNativeTransitionProbe: probe});
  24 |     const native = document.startViewTransition?.bind(document);
  25 |     if (!native) return;
  26 |     document.startViewTransition = (...args: Parameters<typeof native>) => {
  27 |       const transition = native(...args);
  28 |       probe.starts++;
  29 |       probe.pending++;
  30 |       const id = probe.starts, startedUrl = location.pathname, start = performance.now();
  31 |       const record = (stage: string, error?: unknown) => {
  32 |         probe.records.push({id, startedUrl, stage, elapsedMs: performance.now() - start, ...(error === undefined ? {} : {error: String(error)})});
  33 |         if (error !== undefined) probe.errors.push(String(error));
  34 |       };
  35 |       void transition.ready.then(() => record('ready'), error => record('ready-rejected', error));
  36 |       void transition.updateCallbackDone.then(() => record('updated'), error => record('update-rejected', error));
  37 |       void transition.finished.then(() => {probe.pending--; record('finished');}, error => {probe.pending--; record('finish-rejected', error);});
  38 |       return transition;
  39 |     };
  40 |   });
  41 | }
  42 | 
  43 | export async function expectNativeTransitionsSettled(page: Page): Promise<void> {
  44 |   await expect.poll(() => page.evaluate(() => {
  45 |     const probe = (window as Window & {analytifyNativeTransitionProbe: {pending: number; errors: string[]}}).analytifyNativeTransitionProbe;
  46 |     return {pending: probe.pending, errors: probe.errors};
> 47 |   })).toEqual({pending: 0, errors: []});
     |       ^ Error: expect(received).toEqual(expected) // deep equality
  48 | }
  49 | 
  50 | /** Use only when the workflow deliberately starts navigation before the prior animation finishes. */
  51 | export async function expectNativeNavigationRecovery(page: Page): Promise<void> {
  52 |   await expect.poll(async () => transitionRecovery(await page.evaluate(() =>
  53 |     (window as unknown as {analytifyNativeTransitionProbe: TransitionSnapshot}).analytifyNativeTransitionProbe
  54 |   ))).toEqual({pending: 0, missingUpdates: 0, missingFinishes: 0, unmatchedErrors: 0, unexpectedErrors: []});
  55 | }
  56 | 
```