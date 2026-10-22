# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-ambient.spec.ts >> particle cohort keeps its phase across desktop mobile desktop resizing
- Location: e2e/design-v2-ambient.spec.ts:255:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
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
  174 |       const transition = native(callback);
  175 |       void transition.ready.then(() => {
  176 |         (window as any).__reducedTransitionStyles = ['::view-transition-group(root)',
  177 |           '::view-transition-old(root)', '::view-transition-new(root)'].map(pseudo =>
  178 |           getComputedStyle(document.documentElement, pseudo).animationName);
  179 |       }).catch(() => { (window as any).__reducedTransitionStyles = ['transition-ready-rejected']; });
  180 |       return transition;
  181 |     }) as typeof document.startViewTransition;
  182 |   });
  183 |   await mockSpotify(page);
  184 |   await seedAuthenticatedBrowser(page);
  185 |   await page.goto('/new/playlists');
  186 |   await expect(page.getByRole('heading', {name: 'Your playlists', exact: true})).toBeVisible();
  187 |   const restoreViewport = await openNavigationMenu(page);
  188 |   await page.getByRole('link', {name: /Compare playlists/}).click();
  189 |   await expect(page.getByRole('main', {name: 'Compare Room content'})).toBeFocused();
  190 |   await restoreViewport();
  191 |   await expect.poll(() => page.evaluate(() => (window as any).__reducedTransitionStyles))
  192 |     .toEqual(['none', 'none', 'none']);
  193 |   await expect(page.locator('app-ambient-background')).toHaveCount(1);
  194 | });
  195 | 
  196 | 
  197 | test('canonical particle phases loop independently through a complete native timeline', async ({page}, info) => {
  198 |   const context = JSON.parse(await readFile('docs/testing-evidence/design-v2/shell-ambient-particle-geometry.json', 'utf8'));
  199 |   const canonical = JSON.parse(context.content.find((entry: {type: string}) => entry.type === 'text').text);
  200 |   await page.emulateMedia({reducedMotion: 'no-preference'});
  201 |   await page.setViewportSize({width: 1440, height: 810});
  202 |   await page.goto('/new/login');
  203 |   const geometry: unknown[] = [];
  204 |   for (const viewport of [{width: 1440, height: 810}, {width: 390, height: 867}]) {
  205 |     await page.setViewportSize(viewport);
  206 |     const mobile = viewport.width <= 760;
  207 |     await expect(page.locator('.ambient-dot:visible')).toHaveCount(mobile ? 12 : 26);
  208 |     const timing = await page.locator('.ambient-dot:visible').evaluateAll(elements => elements.map(element => {
  209 |       const animation = element.getAnimations()[0];
  210 |       const effect = animation.effect!.getTiming();
  211 |       return {duration: effect.duration, iterations: effect.iterations === Infinity ? 'infinite' : effect.iterations,
  212 |         easing: getComputedStyle(element).animationTimingFunction, playState: animation.playState};
  213 |     }));
  214 |     for (const item of timing) expect(item).toEqual({duration: 24000, iterations: 'infinite', easing: 'ease-in-out', playState: 'running'});
  215 |     for (const [time, phase, next] of [[0, 'A', null], [4000, 'A', 'B'], [8000, 'B', null],
  216 |       [12000, 'B', 'C'], [16000, 'C', null], [20000, 'C', 'A'], [24000, 'A', null]] as const) {
  217 |       await page.locator('.ambient-dot:visible').evaluateAll(async (elements, currentTime) => {
  218 |         await Promise.all(elements.map(async element => {const animation = element.getAnimations()[0]; animation.pause(); await animation.ready; animation.currentTime = currentTime;}));
  219 |       }, time);
  220 |       const sample = await page.locator('.ambient-dot:visible').evaluateAll(elements => elements.map(element => {
  221 |         const style = getComputedStyle(element); const bounds = element.getBoundingClientRect();
  222 |         return {x: bounds.x, y: bounds.y, width: parseFloat(style.width), height: parseFloat(style.height), opacity: parseFloat(style.opacity), color: style.backgroundColor};
  223 |       }));
  224 |       const variant = (name: string) => canonical.variants.find((entry: {name: string}) =>
  225 |         entry.name === `Viewport=${mobile ? 'Mobile' : 'Desktop'}, Scene=Library, Phase=${name}`);
  226 |       const reference = variant(phase); const destination = next ? variant(next) : reference;
  227 |       for (let index = 0; index < sample.length; index++) {
  228 |         const from = reference.dots[index]; const to = destination.dots[index];
  229 |         const x = (from[1] + to[1]) / 2 / reference.size[0] * viewport.width;
  230 |         const y = (from[2] + to[2]) / 2 / reference.size[1] * viewport.height;
  231 |         expect(Math.abs(sample[index].x - x)).toBeLessThan(.03);
  232 |         expect(Math.abs(sample[index].y - y)).toBeLessThan(.03);
  233 |         expect(sample[index]).toMatchObject({width: from[3], height: from[4], color: 'rgb(53, 231, 131)'});
  234 |         expect(Math.abs(sample[index].opacity - from[5])).toBeLessThan(.0001);
  235 |       }
  236 |       geometry.push({viewport, time, sample});
  237 |     }
  238 |     await page.locator('.ambient-dot:visible').evaluateAll(elements => elements.forEach(element => element.getAnimations()[0].play()));
  239 |   }
  240 |   const before = await page.locator('.ambient-dot').first().evaluate(element => element.getAnimations()[0].currentTime as number);
  241 |   await expect.poll(() => page.locator('.ambient-dot').first().evaluate(element => element.getAnimations()[0].currentTime as number)).toBeGreaterThan(before + 100);
  242 | 
  243 |   await page.emulateMedia({reducedMotion: 'reduce'});
  244 |   await expect(page.locator('.ambient-dot').first()).toHaveCSS('animation-name', 'none');
  245 |   expect(await page.locator('.ambient-dot').first().evaluate(element => element.getAnimations().length)).toBe(0);
  246 |   const still = await page.locator('.ambient-dot').first().boundingBox();
  247 |   expect(Math.abs(still!.x - 390 * .17)).toBeLessThan(.03);
  248 |   expect(Math.abs(still!.y - 867 * 194.0625 / 810)).toBeLessThan(.03);
  249 |   await page.emulateMedia({reducedMotion: 'no-preference'});
  250 |   await expect.poll(() => page.locator('.ambient-dot').first().evaluate(element => element.getAnimations()[0]?.playState)).toBe('running');
  251 |   await writeFile(info.outputPath('canonical-particle-timeline.json'), JSON.stringify(geometry, null, 2));
  252 | });
  253 | 
  254 | 
  255 | test('particle cohort keeps its phase across desktop mobile desktop resizing', async ({page}) => {
  256 |   await page.emulateMedia({reducedMotion: 'no-preference'});
  257 |   await page.setViewportSize({width: 1440, height: 810});
  258 |   await page.goto('/new/login');
  259 |   await expect(page.locator('.ambient-dot:visible')).toHaveCount(26);
  260 |   await page.locator('.ambient-dot').evaluateAll(async elements => {
  261 |     const first = elements[0].getAnimations()[0]; const extra = elements[12].getAnimations()[0];
  262 |     await Promise.all([first.ready, extra.ready]);
  263 |     (window as any).__particleResize = {first, extra, time: first.currentTime};
  264 |   });
  265 |   await page.setViewportSize({width: 390, height: 867});
  266 |   await expect(page.locator('.ambient-dot:visible')).toHaveCount(12);
  267 |   await page.setViewportSize({width: 1440, height: 810});
  268 |   await expect(page.locator('.ambient-dot:visible')).toHaveCount(26);
  269 |   const result = await page.locator('.ambient-dot').evaluateAll(elements => {
  270 |     const first = elements[0].getAnimations()[0]; const extra = elements[12].getAnimations()[0];
  271 |     return {sameFirst: first === (window as any).__particleResize.first, sameExtra: extra === (window as any).__particleResize.extra,
  272 |       phaseDifference: Math.abs(Number(first.currentTime) - Number(extra.currentTime)), advanced: Number(first.currentTime) >= Number((window as any).__particleResize.time)};
  273 |   });
> 274 |   expect(result.sameFirst).toBe(true); expect(result.sameExtra).toBe(true);
      |                                                                 ^ Error: expect(received).toBe(expected) // Object.is equality
  275 |   expect(result.phaseDifference).toBeLessThan(1); expect(result.advanced).toBe(true);
  276 | });
  277 | 
```