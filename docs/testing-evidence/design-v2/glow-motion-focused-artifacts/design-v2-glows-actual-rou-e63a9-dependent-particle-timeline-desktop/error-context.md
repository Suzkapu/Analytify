# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-glows.spec.ts >> actual route changes move glows smoothly and preserve the independent particle timeline
- Location: e2e/design-v2-glows.spec.ts:58:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('complementary', { name: 'Desktop sidebar' }).getByRole('link', { name: 'Recently Played', exact: true })

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
  - main "Compare Room content" [active] [ref=f1e48]:
    - generic [ref=f1e50]:
      - generic [ref=f1e51]:
        - generic [ref=f1e52]:
          - generic [ref=f1e53]: Private temporary session
          - heading "Playlist Compare Room" [level=1] [ref=f1e54]
          - paragraph [ref=f1e55]: Choose playlists together, find the songs everyone shares, or combine every unique track.
        - generic [ref=f1e56]:
          - generic [ref=f1e57]: 
          - text: Guest logins are not saved
      - list "Compare progress. Step 1 of 3" [ref=f1e58]:
        - listitem [ref=f1e59]:
          - generic [ref=f1e60]: "1"
          - text: Add people
        - listitem [ref=f1e61]:
          - generic [ref=f1e62]: "2"
          - text: Choose playlists
        - listitem [ref=f1e63]:
          - generic [ref=f1e64]: "3"
          - text: Compare
      - generic [ref=f1e65]:
        - generic [ref=f1e66]: 
        - heading "Preparing your private room…" [level=2] [ref=f1e67]
  - text:   
  - contentinfo [ref=f1e68]:
    - generic [ref=f1e69]: Powered by Spotify
    - generic [ref=f1e70]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e71] [cursor=pointer]:
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
  47  |     // Capture candidates first. Baselines are added only after Figma review.
  48  |     for (const [name, viewport] of [['desktop', {width: 1440, height: 810}], ['mobile', {width: 390, height: 867}]] as const) {
  49  |       await page.setViewportSize(viewport);
  50  |       await expect.poll(() => ambient.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalHeight === (window.innerWidth <= 760 ? 760 : 1050)))).toBe(true);
  51  |       await ambient.screenshot({path: info.outputPath(`candidate-${scene.toLowerCase()}-${name}.png`), scale: 'css', animations: 'disabled',
  52  |         style: '.design-v2 > :not(app-ambient-background), .ambient-dots {visibility:hidden !important;}'});
  53  |     }
  54  |   });
  55  | }
  56  | 
  57  | 
  58  | test('actual route changes move glows smoothly and preserve the independent particle timeline', async ({page}, info) => {
  59  |   const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  60  |   await page.route('https://**', route => route.fulfill({status: 503, json: {message: 'Isolated glow fixture'}}));
  61  |   await mockSpotify(page); await seedAuthenticatedBrowser(page);
  62  |   await page.emulateMedia({reducedMotion: 'no-preference'});
  63  |   await page.setViewportSize({width: 1440, height: 810});
  64  |   await page.goto('/new/playlists');
  65  |   const ambient = page.locator('app-ambient-background');
  66  |   await expect.poll(() => ambient.evaluate(element => element.style.getPropertyValue('--ambient-primary-x'))).toBe('25.0000%');
  67  |   await page.locator('.ambient-dot').first().evaluate(async element => {
  68  |     const animation = element.getAnimations()[0]; await animation.ready;
  69  |     (window as any).__glowParticle = animation; (window as any).__glowParticleTime = animation.currentTime;
  70  |   });
  71  |   await ambient.evaluate(element => {
  72  |     (window as any).__glowFrames = []; (window as any).__glowSettled = false;
  73  |     let frames = 0;
  74  |     const sample = () => {
  75  |       const x = parseFloat(element.style.getPropertyValue('--ambient-primary-x'));
  76  |       const y = parseFloat(element.style.getPropertyValue('--ambient-primary-y'));
  77  |       (window as any).__glowFrames.push({x, y});
  78  |       if (x === 68 && y === 30) {(window as any).__glowSettled = true; return;}
  79  |       if (++frames < 360) requestAnimationFrame(sample);
  80  |     };
  81  |     requestAnimationFrame(sample);
  82  |   });
  83  |   const sidebar = page.getByRole('complementary', {name: 'Desktop sidebar'});
  84  |   await sidebar.getByRole('link', {name: 'Compare playlists', exact: true}).click();
  85  |   await expect(page).toHaveURL(/\/compare-room$/);
  86  |   await expect.poll(() => page.evaluate(() => (window as any).__glowFrames.some((frame: {x: number}) => frame.x > 25 && frame.x < 40))).toBe(true);
  87  |   // Interrupt the first move through another real destination, before its
  88  |   // completion can overwrite the latest route's canonical target.
> 89  |   await sidebar.getByRole('link', {name: 'Recently Played', exact: true}).click();
      |                                                                           ^ Error: locator.click: Test timeout of 30000ms exceeded.
  90  |   await expect(page).toHaveURL(/\/history$/);
  91  |   await expect.poll(() => page.evaluate(() => (window as any).__glowSettled)).toBe(true);
  92  |   expect(await page.locator('.ambient-dot').first().evaluate(element => element.getAnimations()[0] === (window as any).__glowParticle
  93  |     && Number(element.getAnimations()[0].currentTime) > Number((window as any).__glowParticleTime))).toBe(true);
  94  |   await page.emulateMedia({reducedMotion: 'reduce'});
  95  |   await sidebar.getByRole('link', {name: 'Compare playlists', exact: true}).click();
  96  |   await expect.poll(() => ambient.evaluate(element => element.style.getPropertyValue('--ambient-primary-x'))).toBe('40.0000%');
  97  |   expect(await page.locator('.ambient-dot').first().evaluate(element => element.getAnimations().length)).toBe(0);
  98  |   expect(errors).toEqual([]);
  99  |   await writeFile(info.outputPath('native-glow-route-frames.json'), JSON.stringify(await page.evaluate(() => (window as any).__glowFrames), null, 2));
  100 | });
  101 | 
```