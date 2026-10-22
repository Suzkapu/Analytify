# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-friends.spec.ts >> Friends native workflow and responsive recovery (no-preference)
- Location: e2e/design-v2-friends.spec.ts:7:7

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

  Object {
-   "errors": Array [],
+   "errors": Array [
+     "AbortError: Transition was skipped. New ViewTransition started",
+   ],
    "pending": 0,
  }

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=f2e5]:
  - link "Skip to main content" [ref=f2e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - banner [ref=f2e7]:
    - link "Analytify playlists" [ref=f2e9] [cursor=pointer]:
      - /url: /new/playlists
      - generic [ref=f2e10]: Analytify
  - main "Sign in content" [active] [ref=f2e11]:
    - region [ref=f2e14]:
      - generic [ref=f2e15]:
        - generic [ref=f2e16]: Your Spotify library
        - heading "Explore your playlists." [level=1] [ref=f2e17]
        - paragraph [ref=f2e18]: Browse, search, share, and organize your Spotify playlists.
        - list "Analytify features" [ref=f2e19]:
          - listitem [ref=f2e20]:
            - generic [aria-hidden] [ref=f2e21]: 
            - generic [ref=f2e22]:
              - strong [ref=f2e23]: Your Spotify library
              - text: with fast playlist and song search
          - listitem [ref=f2e24]:
            - generic [aria-hidden] [ref=f2e25]: 
            - generic [ref=f2e26]:
              - strong [ref=f2e27]: Useful playlist tools
              - text: for summaries, merging, and sharing
          - listitem [ref=f2e28]:
            - generic [aria-hidden] [ref=f2e29]: 
            - generic [ref=f2e30]:
              - strong [ref=f2e31]: Stored on this device
              - text: unless a feature needs the cloud
      - article [ref=f2e32]:
        - generic [ref=f2e33]:
          - link "Analytify home" [ref=f2e34] [cursor=pointer]:
            - /url: /new/
            - generic [ref=f2e35]: Analytify
          - generic [ref=f2e36]: Welcome to Analytify
          - heading "Connect your Spotify account" [level=2] [ref=f2e37]
          - paragraph [ref=f2e38]: Sign in to load your Spotify library and playlists.
          - paragraph [ref=f2e39]: Spotify will be asked for your profile, saved songs, playlists, top songs and artists, and recently played songs. Analytify requests playlist write access only for playlist copies you choose to create. It never reads your password or payment details.
        - generic [ref=f2e40]:
          - generic [ref=f2e41] [cursor=pointer]:
            - checkbox "I agree to the Terms and acknowledge the Privacy Notice." [checked] [ref=f2e42]
            - generic [ref=f2e43]:
              - text: I agree to the
              - link "Terms" [ref=f2e44]:
                - /url: /new/legal#terms
              - text: and acknowledge the
              - link "Privacy Notice" [ref=f2e45]:
                - /url: /new/legal#privacy
              - text: .
          - group [ref=f2e46]:
            - generic "Terms version" [ref=f2e47] [cursor=pointer]
          - button "Continue with Spotify" [ref=f2e48] [cursor=pointer]
          - button "Advanced options" [ref=f2e52] [cursor=pointer]:
            - generic [aria-hidden] [ref=f2e54]: 
        - paragraph [ref=f2e55]:
          - generic [aria-hidden] [ref=f2e56]: 
          - text: Analytify never asks for your Spotify Client Secret. Personal-app sessions stay local unless you explicitly enable cloud features.
  - contentinfo [ref=f2e57]:
    - generic [ref=f2e58]: Powered by Spotify
    - generic [ref=f2e59]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f2e60] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  1  | import {expect, Page} from '@playwright/test';
  2  | 
  3  | /** Observe native promises without changing callbacks, animations or return values. */
  4  | export async function observeNativeTransitions(page: Page): Promise<void> {
  5  |   await page.addInitScript(() => {
  6  |     const probe = {pending: 0, starts: 0, errors: [] as string[]};
  7  |     Object.assign(window, {analytifyNativeTransitionProbe: probe});
  8  |     const native = document.startViewTransition?.bind(document);
  9  |     if (!native) return;
  10 |     document.startViewTransition = (...args: Parameters<typeof native>) => {
  11 |       const transition = native(...args);
  12 |       probe.starts++;
  13 |       probe.pending++;
  14 |       const capture = (error: unknown) => {probe.errors.push(String(error));};
  15 |       void transition.ready.catch(capture);
  16 |       void transition.updateCallbackDone.catch(capture);
  17 |       void transition.finished.then(() => {probe.pending--;}, error => {probe.pending--; capture(error);});
  18 |       return transition;
  19 |     };
  20 |   });
  21 | }
  22 | 
  23 | export async function expectNativeTransitionsSettled(page: Page): Promise<void> {
  24 |   await expect.poll(() => page.evaluate(() => {
  25 |     const probe = (window as Window & {analytifyNativeTransitionProbe: {pending: number; errors: string[]}}).analytifyNativeTransitionProbe;
  26 |     return {pending: probe.pending, errors: probe.errors};
> 27 |   })).toEqual({pending: 0, errors: []});
     |       ^ Error: expect(received).toEqual(expected) // deep equality
  28 | }
  29 | 
```