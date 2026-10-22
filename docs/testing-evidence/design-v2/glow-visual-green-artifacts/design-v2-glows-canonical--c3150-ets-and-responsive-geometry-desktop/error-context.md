# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-glows.spec.ts >> canonical glow scene Insights preserves native assets and responsive geometry
- Location: e2e/design-v2-glows.spec.ts:6:7

# Error details

```
Error: expect(locator).toHaveScreenshot(expected) failed

Locator: locator('app-ambient-background')
  312452 pixels (ratio 0.27 of all image pixels) are different.

  Snapshot: glow-insights-desktop.png

Call log:
  - Expect "toHaveScreenshot(glow-insights-desktop.png)" locator('app-ambient-background') with timeout 5000ms
    - verifying given screenshot expectation
  - waiting for locator('app-ambient-background')
    - locator resolved to <app-ambient-background aria-hidden="true" _nghost-ng-c1024644701="" _ngcontent-ng-c1778716678="">…</app-ambient-background>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - 312452 pixels (ratio 0.27 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - waiting for locator('app-ambient-background')
    - locator resolved to <app-ambient-background aria-hidden="true" _nghost-ng-c1024644701="" _ngcontent-ng-c1778716678="">…</app-ambient-background>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - captured a stable screenshot
  - 312452 pixels (ratio 0.27 of all image pixels) are different.

```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link "Skip to main content" [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - complementary "Desktop sidebar" [ref=f1e7]:
    - generic [ref=f1e9]:
      - button "Collapse navigation sidebar" [expanded] [ref=f1e10] [cursor=pointer]:
        - generic [ref=f1e11]: Analytify
      - navigation "All destinations" [ref=f1e12]:
        - generic [ref=f1e13]:
          - paragraph [ref=f1e14]: Library
          - link "Playlists" [ref=f1e15] [cursor=pointer]:
            - /url: /new/playlists
            - generic [aria-hidden] [ref=f1e16]: 
        - generic [ref=f1e18]:
          - paragraph [ref=f1e19]: Listening
          - link "Stats" [ref=f1e20] [cursor=pointer]:
            - /url: /new/stats
            - generic [aria-hidden] [ref=f1e21]: 
          - link "History" [ref=f1e23] [cursor=pointer]:
            - /url: /new/history
            - generic [aria-hidden] [ref=f1e24]: 
        - generic [ref=f1e26]:
          - paragraph [ref=f1e27]: Social
          - link "Friends" [ref=f1e28] [cursor=pointer]:
            - /url: /new/friends
            - generic [aria-hidden] [ref=f1e29]: 
          - link "Song Leagues" [ref=f1e31] [cursor=pointer]:
            - /url: /new/song-league
            - generic [aria-hidden] [ref=f1e32]: 
          - link "Private Sharing" [ref=f1e34] [cursor=pointer]:
            - /url: /new/shared-playlists
            - generic [aria-hidden] [ref=f1e35]: 
        - generic [ref=f1e37]:
          - paragraph [ref=f1e38]: Tools
          - link "Compare playlists" [ref=f1e39] [cursor=pointer]:
            - /url: /new/compare-room
            - generic [aria-hidden] [ref=f1e40]: 
      - link "Settings" [ref=f1e42] [cursor=pointer]:
        - /url: /new/settings/account
        - generic [ref=f1e44]: B
        - generic [ref=f1e45]:
          - strong [ref=f1e46]: Browser test user
          - generic [ref=f1e47]: Settings
  - text: 
  - main "Recently Played content" [ref=f1e48]:
    - generic "Recently played" [ref=f1e50]:
      - generic [ref=f1e51]:
        - generic [ref=f1e53]:
          - paragraph [ref=f1e54]: Listening activity
          - heading "Recently played" [level=1] [ref=f1e56]
          - paragraph [ref=f1e57]: Your latest Spotify plays, ordered from newest to oldest.
        - generic [ref=f1e59]:
          - region "Today" [ref=f1e60]:
            - generic [ref=f1e63]:
              - heading "Today" [level=2] [ref=f1e64]
              - paragraph [ref=f1e65]: 1 play
            - generic [ref=f1e67]:
              - time [ref=f1e68]: Just now
              - button "Open Played today on Spotify" [ref=f1e69] [cursor=pointer]:
                - img "Played today cover" [ref=f1e70]
              - generic [ref=f1e71]:
                - strong [ref=f1e72]: Played today
                - generic [ref=f1e73]: Test Artist
          - region "Yesterday" [ref=f1e74]:
            - generic [ref=f1e77]:
              - heading "Yesterday" [level=2] [ref=f1e78]
              - paragraph [ref=f1e79]: 1 play
            - generic [ref=f1e81]:
              - time [ref=f1e82]: Oct 18, 08:24 PM
              - button "Open Played yesterday on Spotify" [ref=f1e83] [cursor=pointer]:
                - img "Played yesterday cover" [ref=f1e84]
              - generic [ref=f1e85]:
                - strong [ref=f1e86]: Played yesterday
                - generic [ref=f1e87]: Test Artist
  - text:   
  - contentinfo [ref=f1e88]:
    - generic [ref=f1e89]: Powered by Spotify
    - generic [ref=f1e90]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e91] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  1   | import {readFile, writeFile} from 'node:fs/promises';
  2   | import {expect, test} from './fixtures';
  3   | import {mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';
  4   | 
  5   | for (const [scene, path] of [['Library', 'playlists'], ['Insights', 'history'], ['Social', 'compare-room'], ['League', 'song-league']] as const) {
  6   |   test(`canonical glow scene ${scene} preserves native assets and responsive geometry`, async ({page}, info) => {
  7   |     const envelope = JSON.parse(await readFile('docs/testing-evidence/design-v2/ambient-route-glow-canonical-geometry.json', 'utf8'));
  8   |     const canonical = JSON.parse(envelope.content.find((item: {type: string}) => item.type === 'text').text);
  9   |     const errors: string[] = []; const isolatedRequests: string[] = [];
  10  |     page.on('pageerror', error => errors.push(error.message));
  11  |     // All remote transports are synthetic. Real cloud identity/workflows are
  12  |     // separate contracts; this test mounts actual routes to verify their scene.
  13  |     await page.route('https://**', route => {isolatedRequests.push(new URL(route.request().url()).origin); return route.fulfill({status: 503, json: {message: 'Isolated glow fixture'}});});
  14  |     await mockSpotify(page); await seedAuthenticatedBrowser(page);
  15  |     await page.emulateMedia({reducedMotion: 'reduce'});
  16  |     await page.goto(`/new/${path}`);
  17  |     const ambient = page.locator('app-ambient-background');
  18  |     await expect(ambient.locator('.ambient-primary img, .ambient-secondary img')).toHaveCount(2);
  19  |     await expect.poll(() => ambient.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  20  |     const geometry: unknown[] = [];
  21  |     for (const width of [1440, 1920, 1024, 768, 761, 760, 390, 360, 320]) for (const height of [480, 1000]) {
  22  |       await page.setViewportSize({width, height});
  23  |       const mobile = width <= 760;
  24  |       const reference = canonical.variants.find((variant: {name: string}) => variant.name === `Viewport=${mobile ? 'Mobile' : 'Desktop'}, Scene=${scene}`);
  25  |       await expect.poll(() => ambient.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalHeight === (window.innerWidth <= 760 ? 760 : 1050)))).toBe(true);
  26  |       const sample = await ambient.evaluate(element => ({background: getComputedStyle(element).backgroundColor, backgroundImage: getComputedStyle(element).backgroundImage,
  27  |         glows: ['.ambient-primary', '.ambient-secondary'].map(selector => {
  28  |           const glow = element.querySelector(selector)!; const image = glow.querySelector('img')!;
  29  |           const rect = image.getBoundingClientRect(); const style = getComputedStyle(glow);
  30  |           return {x: rect.x, y: rect.y, width: rect.width, height: rect.height, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
  31  |             asset: new URL(image.currentSrc).pathname.split('/').pop(), alt: image.alt, opacity: style.opacity, backgroundImage: style.backgroundImage};
  32  |         })}));
  33  |       expect(sample.background).toBe('rgb(7, 11, 9)'); expect(sample.backgroundImage).toBe('none');
  34  |       for (const [index, glow] of sample.glows.entries()) {
  35  |         const target = reference.glows[index];
  36  |         const expectedX = (target.x + target.width / 2) / reference.width * width - target.width / 2;
  37  |         const expectedY = (target.y + target.height / 2) / reference.height * height - target.height / 2;
  38  |         expect(Math.abs(glow.x - expectedX)).toBeLessThan(.03); expect(Math.abs(glow.y - expectedY)).toBeLessThan(.03);
  39  |         expect(glow).toMatchObject({width: target.width, height: target.height, naturalWidth: target.width, naturalHeight: target.height,
  40  |           asset: `ambient-${index === 0 ? 'green' : 'blue'}-${mobile ? 'mobile' : 'desktop'}.svg`, alt: '', opacity: '1', backgroundImage: 'none'});
  41  |       }
  42  |       geometry.push({scene, width, height, sample});
  43  |     }
  44  |     expect(errors).toEqual([]);
  45  |     await writeFile(info.outputPath('canonical-glow-geometry.json'), JSON.stringify({geometry, isolatedRequests}, null, 2));
  46  |     await page.screenshot({path: info.outputPath('canonical-glow-mobile-page.png'), fullPage: true});
  47  |     // Keep both captures even when an assertion fails. Initial baselines were
  48  |     // reviewed against Figma before copying; see glow-component-visual-review.json.
  49  |     for (const [name, viewport] of [['desktop', {width: 1440, height: 810}], ['mobile', {width: 390, height: 867}]] as const) {
  50  |       await page.setViewportSize(viewport);
  51  |       await expect.poll(() => ambient.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalHeight === (window.innerWidth <= 760 ? 760 : 1050)))).toBe(true);
  52  |       await ambient.screenshot({path: info.outputPath(`candidate-${scene.toLowerCase()}-${name}.png`), scale: 'css', animations: 'disabled',
  53  |         style: '.design-v2 > :not(app-ambient-background), .ambient-dots {visibility:hidden !important;}'});
  54  |     }
  55  |     for (const [name, viewport] of [['desktop', {width: 1440, height: 810}], ['mobile', {width: 390, height: 867}]] as const) {
  56  |       await page.setViewportSize(viewport);
> 57  |       await expect(ambient).toHaveScreenshot(`glow-${scene.toLowerCase()}-${name}.png`, {scale: 'css', animations: 'disabled', threshold: .01, maxDiffPixels: 0,
      |                             ^ Error: expect(locator).toHaveScreenshot(expected) failed
  58  |         style: '.design-v2 > :not(app-ambient-background), .ambient-dots {visibility:hidden !important;}'});
  59  |     }
  60  |   });
  61  | }
  62  | 
  63  | 
  64  | test('actual route changes move glows smoothly and preserve the independent particle timeline', async ({page}, info) => {
  65  |   const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  66  |   await page.route('https://**', route => route.fulfill({status: 503, json: {message: 'Isolated glow fixture'}}));
  67  |   await mockSpotify(page); await seedAuthenticatedBrowser(page);
  68  |   await page.emulateMedia({reducedMotion: 'no-preference'});
  69  |   await page.setViewportSize({width: 1440, height: 810});
  70  |   await page.goto('/new/playlists');
  71  |   const ambient = page.locator('app-ambient-background');
  72  |   await expect.poll(() => ambient.evaluate(element => element.style.getPropertyValue('--ambient-primary-x'))).toBe('25.0000%');
  73  |   await page.locator('.ambient-dot').first().evaluate(async element => {
  74  |     const animation = element.getAnimations()[0]; await animation.ready;
  75  |     (window as any).__glowParticle = animation; (window as any).__glowParticleTime = animation.currentTime;
  76  |   });
  77  |   await ambient.evaluate(element => {
  78  |     (window as any).__glowFrames = []; (window as any).__glowSettled = false;
  79  |     let frames = 0;
  80  |     const sample = () => {
  81  |       const x = parseFloat(element.style.getPropertyValue('--ambient-primary-x'));
  82  |       const y = parseFloat(element.style.getPropertyValue('--ambient-primary-y'));
  83  |       (window as any).__glowFrames.push({x, y});
  84  |       if (x === 68 && y === 30) {(window as any).__glowSettled = true; return;}
  85  |       if (++frames < 360) requestAnimationFrame(sample);
  86  |     };
  87  |     requestAnimationFrame(sample);
  88  |   });
  89  |   const sidebar = page.getByRole('complementary', {name: 'Desktop sidebar'});
  90  |   await sidebar.getByRole('link', {name: 'Compare playlists', exact: true}).click();
  91  |   await expect(page).toHaveURL(/\/compare-room$/);
  92  |   await expect.poll(() => page.evaluate(() => (window as any).__glowFrames.some((frame: {x: number}) => frame.x > 25 && frame.x < 40))).toBe(true);
  93  |   // Interrupt the first move through another real destination, before its
  94  |   // completion can overwrite the latest route's canonical target.
  95  |   await sidebar.getByRole('link', {name: 'History', exact: true}).click();
  96  |   await expect(page).toHaveURL(/\/history$/);
  97  |   await expect.poll(() => page.evaluate(() => (window as any).__glowSettled)).toBe(true);
  98  |   expect(await page.locator('.ambient-dot').first().evaluate(element => element.getAnimations()[0] === (window as any).__glowParticle
  99  |     && Number(element.getAnimations()[0].currentTime) > Number((window as any).__glowParticleTime))).toBe(true);
  100 |   await page.emulateMedia({reducedMotion: 'reduce'});
  101 |   await sidebar.getByRole('link', {name: 'Compare playlists', exact: true}).click();
  102 |   await expect.poll(() => ambient.evaluate(element => element.style.getPropertyValue('--ambient-primary-x'))).toBe('40.0000%');
  103 |   expect(await page.locator('.ambient-dot').first().evaluate(element => element.getAnimations().length)).toBe(0);
  104 |   expect(errors).toEqual([]);
  105 |   await writeFile(info.outputPath('native-glow-route-frames.json'), JSON.stringify(await page.evaluate(() => (window as any).__glowFrames), null, 2));
  106 | });
  107 | 
```