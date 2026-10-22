# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-glows.spec.ts >> canonical glow scene Library preserves native assets and responsive geometry
- Location: e2e/design-v2-glows.spec.ts:6:7

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('app-ambient-background').locator('.ambient-primary img, .ambient-secondary img')
Expected: 2
Received: 0
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" locator('app-ambient-background').locator('.ambient-primary img, .ambient-secondary img') with timeout 5000ms
  - waiting for locator('app-ambient-background').locator('.ambient-primary img, .ambient-secondary img')
    14 × locator resolved to 0 elements
       - unexpected value "0"

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
  - main "Your Playlists content" [ref=f1e48]:
    - generic "Your playlists" [ref=f1e50]:
      - generic [ref=f1e51]:
        - generic [ref=f1e52]:
          - generic [ref=f1e53]:
            - paragraph [ref=f1e54]: Your Spotify library
            - heading "Your playlists" [level=1] [ref=f1e56]
            - paragraph [ref=f1e57]: Open a playlist, search its songs, or see a quick summary.
          - generic "Page actions" [ref=f1e58]:
            - generic "2 playlists" [ref=f1e59]
        - group "Playlist controls" [ref=f1e62]:
          - generic [ref=f1e64]:
            - generic [ref=f1e65]: Search playlists
            - generic [ref=f1e66]:
              - generic [aria-hidden]: 
              - searchbox "Search your playlists" [ref=f1e67]
          - 'button "Song count: default order" [ref=f1e68] [cursor=pointer]':
            - generic [ref=f1e69]: 
            - text: "Song count: default order"
        - region "Your playlists" [ref=f1e71]:
          - generic [ref=f1e72]:
            - link "Open Favourite Tracks on Spotify" [ref=f1e73] [cursor=pointer]:
              - /url: ""
              - img "Favourite Tracks cover" [ref=f1e74]
            - generic [ref=f1e75]:
              - heading "Favourite Tracks" [level=2] [ref=f1e76]
              - paragraph [ref=f1e77]: 0 songs
            - generic [ref=f1e78]:
              - link " Open" [ref=f1e79] [cursor=pointer]:
                - /url: /new/songs/fav
                - generic [ref=f1e80]: 
                - text: Open
              - link " Analyze" [ref=f1e81] [cursor=pointer]:
                - /url: /new/analysis/fav
                - generic [ref=f1e82]: 
                - text: Analyze
          - generic [ref=f1e83]:
            - link "Open Test Playlist on Spotify" [ref=f1e84] [cursor=pointer]:
              - /url: ""
              - img "Test Playlist cover" [ref=f1e85]
            - generic [ref=f1e86]:
              - heading "Test Playlist" [level=2] [ref=f1e87]
              - paragraph [ref=f1e88]: 1 song
            - generic [ref=f1e89]:
              - link " Open" [ref=f1e90] [cursor=pointer]:
                - /url: /new/songs/playlist-1
                - generic [ref=f1e91]: 
                - text: Open
              - link " Analyze" [ref=f1e92] [cursor=pointer]:
                - /url: /new/analysis/playlist-1
                - generic [ref=f1e93]: 
                - text: Analyze
  - text:   
  - contentinfo [ref=f1e94]:
    - generic [ref=f1e95]: Powered by Spotify
    - generic [ref=f1e96]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e97] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  1  | import {readFile, writeFile} from 'node:fs/promises';
  2  | import {expect, test} from './fixtures';
  3  | import {mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';
  4  | 
  5  | for (const [scene, path] of [['Library', 'playlists'], ['Insights', 'history'], ['Social', 'compare-room'], ['League', 'song-league']] as const) {
  6  |   test(`canonical glow scene ${scene} preserves native assets and responsive geometry`, async ({page}, info) => {
  7  |     const envelope = JSON.parse(await readFile('docs/testing-evidence/design-v2/ambient-route-glow-canonical-geometry.json', 'utf8'));
  8  |     const canonical = JSON.parse(envelope.content.find((item: {type: string}) => item.type === 'text').text);
  9  |     const errors: string[] = []; const isolatedRequests: string[] = [];
  10 |     page.on('pageerror', error => errors.push(error.message));
  11 |     // All remote transports are synthetic. Real cloud identity/workflows are
  12 |     // separate contracts; this test mounts actual routes to verify their scene.
  13 |     await page.route('https://**', route => {isolatedRequests.push(new URL(route.request().url()).origin); return route.fulfill({status: 503, json: {message: 'Isolated glow fixture'}});});
  14 |     await mockSpotify(page); await seedAuthenticatedBrowser(page);
  15 |     await page.emulateMedia({reducedMotion: 'reduce'});
  16 |     await page.goto(`/new/${path}`);
  17 |     const ambient = page.locator('app-ambient-background');
> 18 |     await expect(ambient.locator('.ambient-primary img, .ambient-secondary img')).toHaveCount(2);
     |                                                                                   ^ Error: expect(locator).toHaveCount(expected) failed
  19 |     await expect.poll(() => ambient.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  20 |     const geometry: unknown[] = [];
  21 |     for (const width of [1440, 1920, 1024, 768, 761, 760, 390, 360, 320]) for (const height of [480, 1000]) {
  22 |       await page.setViewportSize({width, height});
  23 |       const mobile = width <= 760;
  24 |       const reference = canonical.variants.find((variant: {name: string}) => variant.name === `Viewport=${mobile ? 'Mobile' : 'Desktop'}, Scene=${scene}`);
  25 |       await expect.poll(() => ambient.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalHeight === (window.innerWidth <= 760 ? 760 : 1050)))).toBe(true);
  26 |       const sample = await ambient.evaluate(element => ({background: getComputedStyle(element).backgroundColor, backgroundImage: getComputedStyle(element).backgroundImage,
  27 |         glows: ['.ambient-primary', '.ambient-secondary'].map(selector => {
  28 |           const glow = element.querySelector(selector)!; const image = glow.querySelector('img')!;
  29 |           const rect = image.getBoundingClientRect(); const style = getComputedStyle(glow);
  30 |           return {x: rect.x, y: rect.y, width: rect.width, height: rect.height, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
  31 |             asset: new URL(image.currentSrc).pathname.split('/').pop(), alt: image.alt, opacity: style.opacity, backgroundImage: style.backgroundImage};
  32 |         })}));
  33 |       expect(sample.background).toBe('rgb(7, 11, 9)'); expect(sample.backgroundImage).toBe('none');
  34 |       for (const [index, glow] of sample.glows.entries()) {
  35 |         const target = reference.glows[index];
  36 |         const expectedX = (target.x + target.width / 2) / reference.width * width - target.width / 2;
  37 |         const expectedY = (target.y + target.height / 2) / reference.height * height - target.height / 2;
  38 |         expect(Math.abs(glow.x - expectedX)).toBeLessThan(.03); expect(Math.abs(glow.y - expectedY)).toBeLessThan(.03);
  39 |         expect(glow).toMatchObject({width: target.width, height: target.height, naturalWidth: target.width, naturalHeight: target.height,
  40 |           asset: `ambient-${index === 0 ? 'green' : 'blue'}-${mobile ? 'mobile' : 'desktop'}.svg`, alt: '', opacity: '1', backgroundImage: 'none'});
  41 |       }
  42 |       geometry.push({scene, width, height, sample});
  43 |     }
  44 |     expect(errors).toEqual([]);
  45 |     await writeFile(info.outputPath('canonical-glow-geometry.json'), JSON.stringify({geometry, isolatedRequests}, null, 2));
  46 |     await page.screenshot({path: info.outputPath('canonical-glow-mobile-page.png'), fullPage: true});
  47 |   });
  48 | }
  49 | 
```