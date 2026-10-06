# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-performance.spec.ts >> canonical library records navigation and interaction performance evidence
- Location: e2e/design-v2-performance.spec.ts:87:5

# Error details

```
Error: browserContext.newCDPSession: CDP session is only available in Chromium
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
  13  |         const transaction = db.transaction(['appData', 'featureData'], 'readwrite');
  14  |         const tracks = Array.from({length: 1000}, (_, index) => ({
  15  |           id: `large-song-${index}`, name: `Large song ${String(index + 1).padStart(4, '0')}`,
  16  |           playlist_index: index, duration_ms: 120000,
  17  |           artists: [{id: 'artist-1', name: 'Test Artist'}],
  18  |           album: {id: 'album-1', name: 'Test Album', images: []},
  19  |           external_urls: {spotify: `https://open.spotify.com/track/large-song-${index}`}
  20  |         }));
  21  |         for (const userId of ['e2e-user', 'e2e-user_dev']) {
  22  |           transaction.objectStore('featureData').put({key: `${userId}_playlist-1`,
  23  |             value: JSON.stringify([{id: 'artist-1', name: 'Test Artist', images: [], tracks}])});
  24  |           const store = transaction.objectStore('appData');
  25  |           store.put({key: `${userId}_playlist-1_lastUpdated`, value: String(Date.now())});
  26  |           store.put({key: `${userId}_playlist-1_Amount`, value: '1000'});
  27  |           store.put({key: `${userId}_playlist-1_CachedTrackCount`, value: '1000'});
  28  |           store.put({key: `${userId}_playlist-1_Name`, value: JSON.stringify('Large playlist')});
  29  |         }
  30  |         transaction.oncomplete = () => {db.close(); resolve();};
  31  |         transaction.onerror = () => reject(transaction.error);
  32  |       };
  33  |     });
  34  |   });
  35  |   await page.goto('/new/songs/playlist-1');
  36  |   await page.getByRole('button', {name: 'Songs', exact: true}).click();
  37  |   const rows = page.locator('.v2-track-row');
  38  |   await expect(rows).toHaveCount(50);
  39  |   const sample = () => page.evaluate(() => ({
  40  |     elements: document.querySelectorAll('*').length,
  41  |     rows: document.querySelectorAll('.v2-track-row').length,
  42  |     artworkWithoutDimensions: [...document.querySelectorAll<HTMLImageElement>('.v2-track-row img')]
  43  |       .filter(image => !image.width || !image.height).length,
  44  |     eagerArtwork: document.querySelectorAll('.v2-track-row img:not([loading="lazy"])').length
  45  |   }));
  46  |   const initial = await sample();
  47  |   expect(initial.artworkWithoutDimensions).toBe(0);
  48  |   expect(initial.eagerArtwork).toBe(0);
  49  |   const distantCopy = rows.nth(49).locator('.v2-track-copy');
  50  |   await expect.poll(() => distantCopy.evaluate(element =>
  51  |     element.checkVisibility({contentVisibilityAuto: true}))).toBe(false);
  52  |   const containment = await rows.nth(49).evaluate(element => ({
  53  |     contentVisibility: getComputedStyle(element).contentVisibility,
  54  |     intrinsicSize: getComputedStyle(element).containIntrinsicSize,
  55  |     height: element.getBoundingClientRect().height
  56  |   }));
  57  |   expect(containment.contentVisibility).toBe('auto');
  58  |   expect(containment.intrinsicSize).not.toBe('none');
  59  |   expect(containment.height).toBeGreaterThan(0);
  60  |   await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  61  |   await expect(rows).toHaveCount(100);
  62  |   await expect.poll(() => distantCopy.evaluate(element =>
  63  |     element.checkVisibility({contentVisibilityAuto: true}))).toBe(true);
  64  |   const revealedAction = rows.nth(49).getByRole('button', {name: 'Open Large song 0050 on Spotify'});
  65  |   await revealedAction.focus();
  66  |   await expect(revealedAction).toBeFocused();
  67  |   await page.evaluate(() => window.scrollTo(0, 0));
  68  |   const search = page.getByRole('searchbox', {name: 'Search songs or artists'});
  69  |   const samples = [initial, await sample()];
  70  |   for (let iteration = 0; iteration < 3; iteration++) {
  71  |     await search.fill('Large song 1000');
  72  |     await expect(rows).toHaveCount(1);
  73  |     await expect(rows.first()).toContainText('Large song 1000');
  74  |     await search.fill('');
  75  |     await expect(rows).toHaveCount(50);
  76  |     const current = await sample();
  77  |     expect(current).toEqual(initial);
  78  |     samples.push(current);
  79  |   }
  80  |   await testInfo.attach('large-playlist-incremental-rendering.json', {
  81  |     body: JSON.stringify({project: testInfo.project.name, collectionSize: 1000, containment,
  82  |       scope: 'mocked local cache; incremental DOM and full-collection search, not virtualization or field performance', samples}, null, 2),
  83  |     contentType: 'application/json'
  84  |   });
  85  | });
  86  | 
  87  | test('canonical library records navigation and interaction performance evidence', async ({page}, testInfo) => {
  88  |   await mockSpotify(page);
  89  |   await seedAuthenticatedBrowser(page);
  90  |   await page.addInitScript(() => {
  91  |     const metrics = {lcp: 0, cls: 0, shifts: [] as unknown[], longTasks: [] as number[], interactions: [] as number[]};
  92  |     (window as any).__releasePerformance = metrics;
  93  |     for (const type of ['largest-contentful-paint', 'layout-shift', 'longtask', 'event']) {
  94  |       if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
  95  |       new PerformanceObserver(list => {
  96  |         for (const entry of list.getEntries()) {
  97  |           const item = entry as any;
  98  |           if (type === 'largest-contentful-paint') metrics.lcp = entry.startTime;
  99  |           if (type === 'layout-shift' && !item.hadRecentInput) {
  100 |             metrics.cls += item.value;
  101 |             metrics.shifts.push({value: item.value, time: entry.startTime,
  102 |               sources: item.sources?.map((source: any) => ({
  103 |                 node: source.node?.outerHTML?.slice(0, 300),
  104 |                 previousRect: source.previousRect, currentRect: source.currentRect
  105 |               }))});
  106 |           }
  107 |           if (type === 'longtask') metrics.longTasks.push(entry.duration);
  108 |           if (type === 'event' && item.interactionId) metrics.interactions.push(entry.duration);
  109 |         }
  110 |       }).observe(type === 'event' ? {type, buffered: true, durationThreshold: 16} : {type, buffered: true});
  111 |     }
  112 |   });
> 113 |   const profiler = await page.context().newCDPSession(page);
      |                                         ^ Error: browserContext.newCDPSession: CDP session is only available in Chromium
  114 |   await profiler.send('Tracing.start', {
  115 |     categories: 'devtools.timeline,blink.user_timing,toplevel,disabled-by-default-devtools.timeline',
  116 |     transferMode: 'ReturnAsStream'
  117 |   });
  118 |   await page.goto('/new/playlists');
  119 |   const search = page.getByRole('searchbox', {name: 'Search your playlists'});
  120 |   await expect(search).toBeVisible();
  121 |   await expect(page.getByText('Test Playlist', {exact: true})).toBeVisible();
  122 |   await page.evaluate(() => performance.mark('library-search-start'));
  123 |   await search.fill('Test');
  124 |   await page.evaluate(() => {
  125 |     performance.mark('library-search-end');
  126 |     performance.measure('library-search', 'library-search-start', 'library-search-end');
  127 |     performance.mark('account-dialog-start');
  128 |   });
  129 |   await page.getByRole('button', {name: 'Open account and data settings'}).click();
  130 |   await page.keyboard.press('Escape');
  131 |   await page.evaluate(() => {
  132 |     performance.mark('account-dialog-end');
  133 |     performance.measure('account-dialog-open-close', 'account-dialog-start', 'account-dialog-end');
  134 |   });
  135 |   await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  136 |   const metrics = await page.evaluate(() => (window as any).__releasePerformance);
  137 |   await testInfo.attach('canonical-library-performance.json', {
  138 |     body: JSON.stringify({scope: 'local mocked-data lab sample; not field p75 or a Lighthouse report',
  139 |       project: testInfo.project.name, browser: 'Chromium', metrics}, null, 2),
  140 |     contentType: 'application/json'
  141 |   });
  142 |   const finished = new Promise<{stream: string}>(resolve => profiler.once('Tracing.tracingComplete', resolve));
  143 |   await profiler.send('Tracing.end');
  144 |   const {stream} = await finished;
  145 |   const trace: Buffer[] = [];
  146 |   let eof = false;
  147 |   while (!eof) {
  148 |     const chunk = await profiler.send('IO.read', {handle: stream, size: 262144});
  149 |     trace.push(Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8'));
  150 |     eof = chunk.eof;
  151 |   }
  152 |   await profiler.send('IO.close', {handle: stream});
  153 |   await profiler.detach();
  154 |   const traceBody = Buffer.concat(trace);
  155 |   await testInfo.attach('chrome-performance-trace.json', {
  156 |     body: traceBody, contentType: 'application/json'
  157 |   });
  158 |   const events = JSON.parse(traceBody.toString('utf8')).traceEvents as {name: string}[];
  159 |   expect(events.some(event => event.name === 'library-search')).toBe(true);
  160 |   expect(events.some(event => event.name === 'account-dialog-open-close')).toBe(true);
  161 |   expect(metrics.cls).toBeLessThanOrEqual(0.1);
  162 |   expect(metrics.lcp).toBeGreaterThan(0);
  163 | });
  164 | 
  165 | test('full top-song rankings remain bounded through filtering, tabs, and history dialogs', async ({page}, testInfo) => {
  166 |   await mockSpotify(page);
  167 |   await seedAuthenticatedBrowser(page);
  168 |   await page.route('https://api.spotify.com/v1/me/top/tracks?*', async route => {
  169 |     const url = new URL(route.request().url());
  170 |     const offset = Number(url.searchParams.get('offset') || 0);
  171 |     const limit = Number(url.searchParams.get('limit') || 50);
  172 |     const tracks = Array.from({length: 100}, (_, index) => ({
  173 |       id: `dense-track-${index}`, name: `Ranking song ${String(index + 1).padStart(3, '0')}`,
  174 |       artists: [{id: 'artist-1', name: 'Test Artist'}],
  175 |       album: {id: `album-${index}`, name: `Album ${index}`, images: []},
  176 |       duration_ms: 180000, external_urls: {spotify: `https://open.spotify.com/track/dense-track-${index}`}
  177 |     }));
  178 |     await route.fulfill({json: {items: tracks.slice(offset, offset + limit), total: 100}});
  179 |   });
  180 |   await page.goto('/new/stats');
  181 |   const rows = page.locator('.v2-ranking-row');
  182 |   await expect(rows).toHaveCount(100);
  183 |   const sample = () => page.evaluate(() => ({
  184 |     elements: document.querySelectorAll('*').length,
  185 |     rows: document.querySelectorAll('.v2-ranking-row').length,
  186 |     dialogs: document.querySelectorAll('[role="dialog"]').length,
  187 |     artworkWithoutDimensions: [...document.querySelectorAll<HTMLImageElement>('.v2-ranking-row img')]
  188 |       .filter(image => !image.width || !image.height).length
  189 |   }));
  190 |   const initial = await sample();
  191 |   const search = page.getByRole('searchbox', {name: 'Search songs or artists'});
  192 |   const samples: unknown[] = [initial];
  193 |   for (let iteration = 0; iteration < 3; iteration++) {
  194 |     const start = await page.evaluate(() => performance.now());
  195 |     await search.fill('Ranking song 100');
  196 |     await expect(rows).toHaveCount(1);
  197 |     await search.fill('');
  198 |     await expect(rows).toHaveCount(100);
  199 |     await page.getByRole('button', {name: 'Artists', exact: true}).click();
  200 |     await expect(rows).toHaveCount(0);
  201 |     await expect(page.locator('.v2-ranked-artist')).toHaveCount(1);
  202 |     await page.getByRole('button', {name: 'Songs', exact: true}).click();
  203 |     await expect(rows).toHaveCount(100);
  204 |     const historyAction = rows.first().getByRole('button', {name: 'View position history for Ranking song 001'});
  205 |     await historyAction.press('Enter');
  206 |     const historyDialog = page.getByRole('dialog', {name: 'Ranking song 001 position history'});
  207 |     await expect(historyDialog).toBeVisible();
  208 |     await page.keyboard.press('Escape');
  209 |     await expect(historyDialog).toHaveCount(0);
  210 |     await expect(historyAction).toBeFocused();
  211 |     const current = await sample();
  212 |     expect(current.elements).toBe(initial.elements);
  213 |     expect(current.dialogs).toBe(0);
```