# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-ambient.spec.ts >> v2 ambient layer is decorative, fixed-glow, particle-scroll-responsive, and reflow-safe
- Location: e2e/design-v2-ambient.spec.ts:38:5

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 4
+ Received  + 4

  Object {
-   "secondaryX": "84.91%",
-   "secondaryY": "54.03%",
-   "x": "39.83%",
-   "y": "17.50%",
+   "secondaryX": "84.64%",
+   "secondaryY": "54.45%",
+   "x": "40.04%",
+   "y": "18.10%",
  }
```

# Page snapshot

```yaml
- generic [ref=e5]:
  - link "Skip to main content" [ref=e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - banner [ref=e7]:
    - link "Analytify playlists" [ref=e9] [cursor=pointer]:
      - /url: /new/playlists
      - generic [ref=e10]: Analytify
  - main "Sign in content" [ref=e11]:
    - region [ref=e14]:
      - generic [ref=e15]:
        - generic [ref=e16]: Your Spotify library
        - heading "Explore your playlists." [level=1] [ref=e17]
        - paragraph [ref=e18]: Browse, search, share, and organize your Spotify playlists.
        - list "Analytify features" [ref=e19]:
          - listitem [ref=e20]:
            - generic [aria-hidden] [ref=e21]: 
            - generic [ref=e22]:
              - strong [ref=e23]: Your Spotify library
              - text: with fast playlist and song search
          - listitem [ref=e24]:
            - generic [aria-hidden] [ref=e25]: 
            - generic [ref=e26]:
              - strong [ref=e27]: Useful playlist tools
              - text: for summaries, merging, and sharing
          - listitem [ref=e28]:
            - generic [aria-hidden] [ref=e29]: 
            - generic [ref=e30]:
              - strong [ref=e31]: Stored on this device
              - text: unless a feature needs the cloud
      - article [ref=e32]:
        - generic [ref=e33]:
          - link "Analytify home" [ref=e34] [cursor=pointer]:
            - /url: /new/
            - generic [ref=e35]: Analytify
          - generic [ref=e36]: Welcome to Analytify
          - heading "Connect your Spotify account" [level=2] [ref=e37]
          - paragraph [ref=e38]: Sign in to load your Spotify library and playlists.
          - paragraph [ref=e39]: Spotify will be asked for your profile, saved songs, playlists, top songs and artists, and recently played songs. Analytify requests playlist write access only for playlist copies you choose to create. It never reads your password or payment details.
        - generic [ref=e40]:
          - generic [ref=e41] [cursor=pointer]:
            - checkbox "I agree to the Terms and acknowledge the Privacy Notice." [ref=e42]
            - generic [ref=e43]:
              - text: I agree to the
              - link "Terms" [ref=e44]:
                - /url: /new/legal#terms
              - text: and acknowledge the
              - link "Privacy Notice" [ref=e45]:
                - /url: /new/legal#privacy
              - text: .
          - group [ref=e46]:
            - generic "Terms version" [ref=e47] [cursor=pointer]
          - button "Continue with Spotify" [disabled] [ref=e48]
          - button "Advanced options" [ref=e52] [cursor=pointer]:
            - generic [aria-hidden] [ref=e54]: 
        - paragraph [ref=e55]:
          - generic [aria-hidden] [ref=e56]: 
          - text: Analytify never asks for your Spotify Client Secret. Personal-app sessions stay local unless you explicitly enable cloud features.
  - contentinfo [ref=e57]:
    - generic [ref=e58]: Powered by Spotify
    - generic [ref=e59]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=e60] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  1   | import AxeBuilder from '@axe-core/playwright';
  2   | import {expect, test} from './fixtures';
  3   | import {mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';
  4   | import type {Page} from '@playwright/test';
  5   | 
  6   | // Menu belongs to the mobile header; preserve each test's original viewport
  7   | // after navigating through the real expanded drawer.
  8   | async function openNavigationMenu(page: Page) {
  9   |   const viewport = page.viewportSize();
  10  |   if (viewport && viewport.width > 760) await page.setViewportSize({...viewport, width: 390});
  11  |   await page.getByRole('button', {name: 'Open navigation menu'}).press('Enter');
  12  |   return async () => {if (viewport) await page.setViewportSize(viewport);};
  13  | }
  14  | 
  15  | test('one ambient renderer persists through overlays, routes, and shell modes', async ({page}) => {
  16  |   await mockSpotify(page);
  17  |   await seedAuthenticatedBrowser(page);
  18  |   await page.goto('/new/playlists');
  19  |   const ambient = page.locator('app-ambient-background');
  20  |   await expect(ambient).toHaveCount(1);
  21  |   await ambient.evaluate(element => { (element as HTMLElement & {ambientIdentity?: string}).ambientIdentity = 'persistent'; });
  22  |   const baseIntensity = await ambient.evaluate(element => (element as HTMLElement).style.getPropertyValue('--ambient-intensity'));
  23  | 
  24  |   const restoreViewport = await openNavigationMenu(page);
  25  |   await expect.poll(() => ambient.evaluate(element => (element as HTMLElement).style.getPropertyValue('--ambient-intensity')))
  26  |     .not.toBe(baseIntensity);
  27  |   await page.getByRole('link', {name: /Compare playlists/}).click();
  28  |   await expect(page).toHaveURL(/\/compare-room$/);
  29  |   await restoreViewport();
  30  |   expect(await ambient.evaluate(element => (element as HTMLElement & {ambientIdentity?: string}).ambientIdentity)).toBe('persistent');
  31  |   await expect(ambient).toHaveCount(1);
  32  | 
  33  |   await page.getByRole('link', {name: 'Legal & privacy'}).click();
  34  |   expect(await ambient.evaluate(element => (element as HTMLElement & {ambientIdentity?: string}).ambientIdentity)).toBe('persistent');
  35  |   await expect(page.locator('.design-v2')).toHaveAttribute('data-chrome', 'public');
  36  | });
  37  | 
  38  | test('v2 ambient layer is decorative, fixed-glow, particle-scroll-responsive, and reflow-safe', async ({page}) => {
  39  |   await page.setViewportSize({width: 320, height: 800});
  40  |   await page.goto('/new/login');
  41  |   const ambient = page.locator('app-ambient-background');
  42  |   await expect(ambient).toHaveCount(1);
  43  |   await expect(ambient).toHaveAttribute('aria-hidden', 'true');
  44  |   await expect(ambient).toHaveCSS('pointer-events', 'none');
  45  |   await expect(ambient).toHaveCSS('position', 'fixed');
  46  | 
  47  |   const initial = await ambient.evaluate(element => ({
  48  |     x: (element as HTMLElement).style.getPropertyValue('--ambient-primary-x'),
  49  |     y: (element as HTMLElement).style.getPropertyValue('--ambient-primary-y'),
  50  |     secondaryX: (element as HTMLElement).style.getPropertyValue('--ambient-secondary-x'),
  51  |     secondaryY: (element as HTMLElement).style.getPropertyValue('--ambient-secondary-y'),
  52  |     dotsY: (element as HTMLElement).style.getPropertyValue('--ambient-dots-y')
  53  |   }));
  54  |   await page.locator('.v2-main').evaluate(element => { (element as HTMLElement).style.minHeight = '2400px'; });
  55  |   const maxLongTaskMs = await page.evaluate(async () => {
  56  |     const longTasks: number[] = [];
  57  |     const observer = typeof PerformanceObserver === 'undefined' ? null : new PerformanceObserver(list => {
  58  |       longTasks.push(...list.getEntries().map(entry => entry.duration));
  59  |     });
  60  |     try { observer?.observe({type: 'longtask'}); } catch { /* unsupported browsers simply report no entries */ }
  61  |     for (let step = 0; step <= 24; step++) {
  62  |       window.scrollTo(0, document.documentElement.scrollHeight * step / 24);
  63  |       await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  64  |     }
  65  |     observer?.disconnect();
  66  |     return Math.max(0, ...longTasks);
  67  |   });
  68  |   expect(maxLongTaskMs).toBeLessThan(100);
  69  |   await expect.poll(() => ambient.evaluate(element =>
  70  |     (element as HTMLElement).style.getPropertyValue('--ambient-dots-y')
  71  |   )).not.toBe(initial.dotsY);
  72  |   const scrolled = await ambient.evaluate(element => ({
  73  |     x: (element as HTMLElement).style.getPropertyValue('--ambient-primary-x'),
  74  |     y: (element as HTMLElement).style.getPropertyValue('--ambient-primary-y'),
  75  |     secondaryX: (element as HTMLElement).style.getPropertyValue('--ambient-secondary-x'),
  76  |     secondaryY: (element as HTMLElement).style.getPropertyValue('--ambient-secondary-y')
  77  |   }));
> 78  |   expect(scrolled).toEqual({x: initial.x, y: initial.y, secondaryX: initial.secondaryX, secondaryY: initial.secondaryY});
      |                    ^ Error: expect(received).toEqual(expected) // deep equality
  79  | 
  80  |   const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  81  |   expect(overflow).toBeLessThanOrEqual(1);
  82  |   const axe = await new AxeBuilder({page})
  83  |     .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
  84  |     .analyze();
  85  |   expect(axe.violations, JSON.stringify(axe.violations, null, 2)).toEqual([]);
  86  | 
  87  |   await page.reload();
  88  |   await expect.poll(() => ambient.evaluate(element =>
  89  |     (element as HTMLElement).style.getPropertyValue('--ambient-primary-x')
  90  |   )).toBe(initial.x);
  91  | });
  92  | 
  93  | for (const nativeTransitions of [true, false]) {
  94  |   test(`route content and focus survive with native transitions ${nativeTransitions ? 'enabled' : 'unavailable'}`, async ({page}) => {
  95  |     const errors: string[] = [];
  96  |     page.on('pageerror', error => errors.push(error.message));
  97  |     await page.addInitScript(enabled => {
  98  |       const native = document.startViewTransition?.bind(document);
  99  |       (window as any).__nativeTransitionCalls = 0;
  100 |       (window as any).__nativeTransitionAvailable = !!native;
  101 |       Object.defineProperty(document, 'startViewTransition', {
  102 |         configurable: true,
  103 |         value: enabled && native ? (callback: () => void | Promise<void>) => {
  104 |           (window as any).__nativeTransitionCalls++;
  105 |           return native(callback);
  106 |         } : undefined
  107 |       });
  108 |     }, nativeTransitions);
  109 |     await mockSpotify(page);
  110 |     await seedAuthenticatedBrowser(page);
  111 |     await page.goto('/new/playlists');
  112 |     await expect(page.getByRole('heading', {name: 'Your playlists', exact: true})).toBeVisible();
  113 |     if (nativeTransitions) expect(await page.evaluate(() => (window as any).__nativeTransitionAvailable)).toBe(true);
  114 |     const ambient = page.locator('app-ambient-background');
  115 |     await ambient.evaluate(element => { (element as any).__transitionIdentity = 'same-renderer'; });
  116 |     const previousCalls = await page.evaluate(() => (window as any).__nativeTransitionCalls);
  117 |     const restoreViewport = await openNavigationMenu(page);
  118 |     await page.getByRole('link', {name: /Compare playlists/}).press('Enter');
  119 |     await expect(page).toHaveURL(/\/compare-room$/);
  120 |     await restoreViewport();
  121 |     await expect(page.getByRole('main', {name: 'Compare Room content'})).toBeVisible();
  122 |     await expect(page.locator('main')).toBeFocused();
  123 |     await expect(ambient).toHaveCount(1);
  124 |     expect(await ambient.evaluate(element => (element as any).__transitionIdentity)).toBe('same-renderer');
  125 |     const calls = await page.evaluate(() => (window as any).__nativeTransitionCalls);
  126 |     if (nativeTransitions) expect(calls).toBeGreaterThan(previousCalls);
  127 |     else expect(calls).toBe(0);
  128 |     expect(errors).toEqual([]);
  129 |   });
  130 | }
  131 | 
  132 | test('v2 ambient layer remains static with reduced motion', async ({page}) => {
  133 |   await page.emulateMedia({reducedMotion: 'reduce'});
  134 |   await page.goto('/new/login');
  135 |   const ambient = page.locator('app-ambient-background');
  136 |   const initial = await ambient.evaluate(element => ({
  137 |     x: (element as HTMLElement).style.getPropertyValue('--ambient-primary-x'),
  138 |     y: (element as HTMLElement).style.getPropertyValue('--ambient-primary-y')
  139 |   }));
  140 |   await page.locator('.v2-main').evaluate(element => { (element as HTMLElement).style.minHeight = '2400px'; });
  141 |   await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  142 |   await page.waitForTimeout(100);
  143 |   await expect(ambient).toHaveCSS('pointer-events', 'none');
  144 |   expect(await ambient.evaluate(element => ({
  145 |     x: (element as HTMLElement).style.getPropertyValue('--ambient-primary-x'),
  146 |     y: (element as HTMLElement).style.getPropertyValue('--ambient-primary-y')
  147 |   }))).toEqual(initial);
  148 |   await expect(page.locator('.ambient-dots')).toHaveCSS('transform', 'none');
  149 | });
  150 | 
  151 | test('reduced motion suppresses native route snapshot animations without losing navigation', async ({page}) => {
  152 |   await page.emulateMedia({reducedMotion: 'reduce'});
  153 |   await page.addInitScript(() => {
  154 |     const native = document.startViewTransition.bind(document);
  155 |     (window as any).__reducedTransitionStyles = null;
  156 |     document.startViewTransition = ((callback: () => void | Promise<void>) => {
  157 |       const transition = native(callback);
  158 |       void transition.ready.then(() => {
  159 |         (window as any).__reducedTransitionStyles = ['::view-transition-group(root)',
  160 |           '::view-transition-old(root)', '::view-transition-new(root)'].map(pseudo =>
  161 |           getComputedStyle(document.documentElement, pseudo).animationName);
  162 |       }).catch(() => { (window as any).__reducedTransitionStyles = ['transition-ready-rejected']; });
  163 |       return transition;
  164 |     }) as typeof document.startViewTransition;
  165 |   });
  166 |   await mockSpotify(page);
  167 |   await seedAuthenticatedBrowser(page);
  168 |   await page.goto('/new/playlists');
  169 |   await expect(page.getByRole('heading', {name: 'Your playlists', exact: true})).toBeVisible();
  170 |   const restoreViewport = await openNavigationMenu(page);
  171 |   await page.getByRole('link', {name: /Compare playlists/}).click();
  172 |   await expect(page.getByRole('main', {name: 'Compare Room content'})).toBeFocused();
  173 |   await restoreViewport();
  174 |   await expect.poll(() => page.evaluate(() => (window as any).__reducedTransitionStyles))
  175 |     .toEqual(['none', 'none', 'none']);
  176 |   await expect(page.locator('app-ambient-background')).toHaveCount(1);
  177 | });
  178 | 
```