# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-ambient.spec.ts >> canonical particle phases loop independently through a complete native timeline
- Location: e2e/design-v2-ambient.spec.ts:185:5

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('.ambient-dot:visible')
Expected: 26
Received: 0
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" locator('.ambient-dot:visible') with timeout 5000ms
  - waiting for locator('.ambient-dot:visible')
    14 × locator resolved to 0 elements
       - unexpected value "0"

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
  95  |   )).toBe(initial.x);
  96  | });
  97  | 
  98  | for (const nativeTransitions of [true, false]) {
  99  |   test(`route content and focus survive with native transitions ${nativeTransitions ? 'enabled' : 'unavailable'}`, async ({page}) => {
  100 |     const errors: string[] = [];
  101 |     page.on('pageerror', error => errors.push(error.message));
  102 |     await page.addInitScript(enabled => {
  103 |       const native = document.startViewTransition?.bind(document);
  104 |       (window as any).__nativeTransitionCalls = 0;
  105 |       (window as any).__nativeTransitionAvailable = !!native;
  106 |       Object.defineProperty(document, 'startViewTransition', {
  107 |         configurable: true,
  108 |         value: enabled && native ? (callback: () => void | Promise<void>) => {
  109 |           (window as any).__nativeTransitionCalls++;
  110 |           return native(callback);
  111 |         } : undefined
  112 |       });
  113 |     }, nativeTransitions);
  114 |     await mockSpotify(page);
  115 |     await seedAuthenticatedBrowser(page);
  116 |     await page.goto('/new/playlists');
  117 |     await expect(page.getByRole('heading', {name: 'Your playlists', exact: true})).toBeVisible();
  118 |     if (nativeTransitions) expect(await page.evaluate(() => (window as any).__nativeTransitionAvailable)).toBe(true);
  119 |     const ambient = page.locator('app-ambient-background');
  120 |     await ambient.evaluate(element => { (element as any).__transitionIdentity = 'same-renderer'; });
  121 |     const previousCalls = await page.evaluate(() => (window as any).__nativeTransitionCalls);
  122 |     const restoreViewport = await openNavigationMenu(page);
  123 |     await page.getByRole('link', {name: /Compare playlists/}).press('Enter');
  124 |     await expect(page).toHaveURL(/\/compare-room$/);
  125 |     await restoreViewport();
  126 |     await expect(page.getByRole('main', {name: 'Compare Room content'})).toBeVisible();
  127 |     await expect(page.locator('main')).toBeFocused();
  128 |     await expect(ambient).toHaveCount(1);
  129 |     expect(await ambient.evaluate(element => (element as any).__transitionIdentity)).toBe('same-renderer');
  130 |     const calls = await page.evaluate(() => (window as any).__nativeTransitionCalls);
  131 |     if (nativeTransitions) expect(calls).toBeGreaterThan(previousCalls);
  132 |     else expect(calls).toBe(0);
  133 |     expect(errors).toEqual([]);
  134 |   });
  135 | }
  136 | 
  137 | test('v2 ambient layer remains static with reduced motion', async ({page}) => {
  138 |   await page.emulateMedia({reducedMotion: 'reduce'});
  139 |   await page.goto('/new/login');
  140 |   const ambient = page.locator('app-ambient-background');
  141 |   const initial = await ambient.evaluate(element => ({
  142 |     x: (element as HTMLElement).style.getPropertyValue('--ambient-primary-x'),
  143 |     y: (element as HTMLElement).style.getPropertyValue('--ambient-primary-y')
  144 |   }));
  145 |   await page.locator('.v2-main').evaluate(element => { (element as HTMLElement).style.minHeight = '2400px'; });
  146 |   await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  147 |   await page.waitForTimeout(100);
  148 |   await expect(ambient).toHaveCSS('pointer-events', 'none');
  149 |   expect(await ambient.evaluate(element => ({
  150 |     x: (element as HTMLElement).style.getPropertyValue('--ambient-primary-x'),
  151 |     y: (element as HTMLElement).style.getPropertyValue('--ambient-primary-y')
  152 |   }))).toEqual(initial);
  153 |   await expect(page.locator('.ambient-dots')).toHaveCSS('transform', 'none');
  154 | });
  155 | 
  156 | test('reduced motion suppresses native route snapshot animations without losing navigation', async ({page}) => {
  157 |   await page.emulateMedia({reducedMotion: 'reduce'});
  158 |   await page.addInitScript(() => {
  159 |     const native = document.startViewTransition.bind(document);
  160 |     (window as any).__reducedTransitionStyles = null;
  161 |     document.startViewTransition = ((callback: () => void | Promise<void>) => {
  162 |       const transition = native(callback);
  163 |       void transition.ready.then(() => {
  164 |         (window as any).__reducedTransitionStyles = ['::view-transition-group(root)',
  165 |           '::view-transition-old(root)', '::view-transition-new(root)'].map(pseudo =>
  166 |           getComputedStyle(document.documentElement, pseudo).animationName);
  167 |       }).catch(() => { (window as any).__reducedTransitionStyles = ['transition-ready-rejected']; });
  168 |       return transition;
  169 |     }) as typeof document.startViewTransition;
  170 |   });
  171 |   await mockSpotify(page);
  172 |   await seedAuthenticatedBrowser(page);
  173 |   await page.goto('/new/playlists');
  174 |   await expect(page.getByRole('heading', {name: 'Your playlists', exact: true})).toBeVisible();
  175 |   const restoreViewport = await openNavigationMenu(page);
  176 |   await page.getByRole('link', {name: /Compare playlists/}).click();
  177 |   await expect(page.getByRole('main', {name: 'Compare Room content'})).toBeFocused();
  178 |   await restoreViewport();
  179 |   await expect.poll(() => page.evaluate(() => (window as any).__reducedTransitionStyles))
  180 |     .toEqual(['none', 'none', 'none']);
  181 |   await expect(page.locator('app-ambient-background')).toHaveCount(1);
  182 | });
  183 | 
  184 | 
  185 | test('canonical particle phases loop independently through a complete native timeline', async ({page}, info) => {
  186 |   const context = JSON.parse(await readFile('docs/testing-evidence/design-v2/shell-ambient-particle-geometry.json', 'utf8'));
  187 |   const canonical = JSON.parse(context.content.find((entry: {type: string}) => entry.type === 'text').text);
  188 |   await page.emulateMedia({reducedMotion: 'no-preference'});
  189 |   await page.setViewportSize({width: 1440, height: 810});
  190 |   await page.goto('/new/login');
  191 |   const geometry: unknown[] = [];
  192 |   for (const viewport of [{width: 1440, height: 810}, {width: 390, height: 867}]) {
  193 |     await page.setViewportSize(viewport);
  194 |     const mobile = viewport.width <= 760;
> 195 |     await expect(page.locator('.ambient-dot:visible')).toHaveCount(mobile ? 12 : 26);
      |                                                        ^ Error: expect(locator).toHaveCount(expected) failed
  196 |     const timing = await page.locator('.ambient-dot:visible').evaluateAll(elements => elements.map(element => {
  197 |       const animation = element.getAnimations()[0];
  198 |       const effect = animation.effect!.getTiming();
  199 |       return {duration: effect.duration, iterations: effect.iterations === Infinity ? 'infinite' : effect.iterations,
  200 |         easing: getComputedStyle(element).animationTimingFunction, playState: animation.playState};
  201 |     }));
  202 |     for (const item of timing) expect(item).toEqual({duration: 24000, iterations: 'infinite', easing: 'ease-in-out', playState: 'running'});
  203 |     for (const [time, phase, next] of [[0, 'A', null], [4000, 'A', 'B'], [8000, 'B', null],
  204 |       [12000, 'B', 'C'], [16000, 'C', null], [20000, 'C', 'A'], [24000, 'A', null]] as const) {
  205 |       await page.locator('.ambient-dot:visible').evaluateAll(async (elements, currentTime) => {
  206 |         await Promise.all(elements.map(async element => {const animation = element.getAnimations()[0]; animation.pause(); await animation.ready; animation.currentTime = currentTime;}));
  207 |       }, time);
  208 |       const sample = await page.locator('.ambient-dot:visible').evaluateAll(elements => elements.map(element => {
  209 |         const style = getComputedStyle(element); const matrix = new DOMMatrixReadOnly(style.transform);
  210 |         return {x: matrix.m41, y: matrix.m42, width: parseFloat(style.width), height: parseFloat(style.height), opacity: parseFloat(style.opacity), color: style.backgroundColor};
  211 |       }));
  212 |       const variant = (name: string) => canonical.variants.find((entry: {name: string}) =>
  213 |         entry.name === `Viewport=${mobile ? 'Mobile' : 'Desktop'}, Scene=Library, Phase=${name}`);
  214 |       const reference = variant(phase); const destination = next ? variant(next) : reference;
  215 |       for (let index = 0; index < sample.length; index++) {
  216 |         const from = reference.dots[index]; const to = destination.dots[index];
  217 |         const x = (from[1] + to[1]) / 2 / reference.size[0] * viewport.width;
  218 |         const y = (from[2] + to[2]) / 2 / reference.size[1] * viewport.height;
  219 |         expect(Math.abs(sample[index].x - x)).toBeLessThan(.03);
  220 |         expect(Math.abs(sample[index].y - y)).toBeLessThan(.03);
  221 |         expect(sample[index]).toMatchObject({width: from[3], height: from[4], color: 'rgb(53, 231, 131)'});
  222 |         expect(Math.abs(sample[index].opacity - from[5])).toBeLessThan(.0001);
  223 |       }
  224 |       geometry.push({viewport, time, sample});
  225 |     }
  226 |     await page.locator('.ambient-dot:visible').evaluateAll(elements => elements.forEach(element => element.getAnimations()[0].play()));
  227 |   }
  228 |   const before = await page.locator('.ambient-dot').first().evaluate(element => element.getAnimations()[0].currentTime as number);
  229 |   await expect.poll(() => page.locator('.ambient-dot').first().evaluate(element => element.getAnimations()[0].currentTime as number)).toBeGreaterThan(before + 100);
  230 |   await writeFile(info.outputPath('canonical-particle-timeline.json'), JSON.stringify(geometry, null, 2));
  231 | });
  232 | 
```