# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-date-loading.spec.ts >> ranking date failed stops render retries and recovers after explicit reselection
- Location: e2e/design-v2-stats-date-loading.spec.ts:9:7

# Error details

```
Error: expect(locator).toBeAttached() failed

Locator: getByRole('combobox', { name: 'Ranking date' }).locator('option[value="1791115200000"]')
Expected: attached
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeAttached" getByRole('combobox', { name: 'Ranking date' }).locator('option[value="1791115200000"]') with timeout 5000ms
  - waiting for getByRole('combobox', { name: 'Ranking date' }).locator('option[value="1791115200000"]')

```

```yaml
- link "Skip to main content":
  - /url: "#v2-main-content"
- banner:
  - link "Analytify playlists":
    - /url: /new/playlists
    - text: Analytify
  - navigation "Main navigation":
    - link "Playlists":
      - /url: /new/playlists
    - link "Stats":
      - /url: /new/stats
    - link "History":
      - /url: /new/history
  - button "Open More tools": More
  - button "Open account and data settings"
- main "Your Playlists content":
  - paragraph: Your Spotify library
  - heading "Your playlists" [level=1]
  - paragraph: Open a playlist, search its songs, or see a quick summary.
  - text: 2 playlists
  - group "Playlist controls":
    - text: Search playlists
    - searchbox "Search your playlists"
    - 'button "Song count: default order"': " Song count: default order"
  - region "Your playlists":
    - link "Open Favourite Tracks on Spotify":
      - /url: ""
      - img "Favourite Tracks cover"
    - heading "Favourite Tracks" [level=2]
    - paragraph: 0 songs
    - link " Open":
      - /url: /new/songs/fav
    - link " Analyze":
      - /url: /new/analysis/fav
    - link "Open Test Playlist on Spotify":
      - /url: ""
      - img "Test Playlist cover"
    - heading "Test Playlist" [level=2]
    - paragraph: 1 song
    - link " Open":
      - /url: /new/songs/playlist-1
    - link " Analyze":
      - /url: /new/analysis/playlist-1
- contentinfo:
  - text: Powered by Spotify Artwork and metadata belong to their owners.
  - link "Legal & privacy":
    - /url: /new/legal
```

# Test source

```ts
  1  | import {test,expect} from './fixtures';
  2  | import {mockSpotify,seedAuthenticatedBrowser,expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
  3  | 
  4  | const owner='11111111-1111-4111-8111-111111111111';
  5  | const snapshot='22222222-2222-4222-8222-222222222222';
  6  | const timestamp=new Date('2026-10-04T12:00:00Z').getTime();
  7  | 
  8  | for(const purpose of ['ranking','comparison'] as const) for(const outcome of ['unavailable','failed'] as const) {
  9  |   test(`${purpose} date ${outcome} stops render retries and recovers after explicit reselection`,async({page})=>{
  10 |     await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
  11 |     await mockSpotify(page);await seedAuthenticatedBrowser(page,{cloudIdentity:true});
  12 |     await page.evaluate(async({snapshot,timestamp})=>{
  13 |       await new Promise<void>((resolve,reject)=>{
  14 |         const request=indexedDB.open('AnalytifyDB',4);
  15 |         request.onerror=()=>reject(request.error);
  16 |         request.onsuccess=()=>{
  17 |           const db=request.result,tx=db.transaction('statsHistory','readwrite');
  18 |           for(const userId of ['e2e-user','e2e-user_dev']) tx.objectStore('statsHistory').put({
  19 |             id:`${snapshot}-${userId}`,cloudId:snapshot,userId,range:'short_term',timestamp,
  20 |             snapshotDate:'2026-10-04',topTracks:[],topArtists:[],topGenres:[],isLoaded:false
  21 |           });
  22 |           tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
  23 |         };
  24 |       });
  25 |     },{snapshot,timestamp});
  26 |     const requests:URL[]=[];let recovered=false;
  27 |     await page.route('**/rest/v1/stats_snapshots**',async route=>{
  28 |       const url=new URL(route.request().url());
  29 |       if(!url.searchParams.has('id')) return route.fulfill({json:[]});
  30 |       requests.push(url);
  31 |       if(!recovered) return outcome==='failed'
  32 |         ? route.fulfill({status:503,json:{message:'Isolated saved-date failure'}})
  33 |         : route.fulfill({json:null});
  34 |       return route.fulfill({json:{id:snapshot,snapshot_date:'2026-10-04',created_at:'2026-10-04T12:00:00Z',range:'short_term',
  35 |         stats_snapshot_tracks:[{rank:1,tracks:{id:'recovered-song',name:'Recovered song',duration_ms:180000,explicit:false,
  36 |           albums:{id:'saved-album',name:'Saved album',image_url:null},track_artists:[{artist_rank:0,artists:{id:'saved-artist',name:'Saved Artist'}}]}}],
  37 |         stats_snapshot_artists:[],stats_snapshot_genres:[]}});
  38 |     });
  39 |     await page.goto('/new/statistics');
  40 |     const ranking=page.getByRole('combobox',{name:'Ranking date'});
  41 |     const comparison=page.getByRole('combobox',{name:'Compare against'});
> 42 |     await expect(ranking.locator(`option[value="${timestamp}"]`)).toBeAttached();
     |                                                                   ^ Error: expect(locator).toBeAttached() failed
  43 |     await expect(page.locator('.v2-ranked-song strong').filter({hasText:'Test Song'})).toBeVisible();
  44 |     const control=purpose==='ranking'?ranking:comparison;
  45 |     await control.selectOption(String(timestamp));
  46 |     await expect.poll(()=>requests.length).toBe(1);
  47 |     if(purpose==='ranking') await expect(page.getByText('No top songs found',{exact:true})).toBeVisible();
  48 |     else await expect(page.locator('.v2-ranked-song strong').filter({hasText:'Test Song'})).toBeVisible();
  49 |     const search=page.getByRole('textbox',{name:'Search top songs'});
  50 |     for(const query of ['Saved','not found','']) {
  51 |       await search.fill(query);await expect(search).toHaveValue(query);
  52 |       if(query) await expect(page.getByText('No top songs found',{exact:true})).toBeVisible();
  53 |     }
  54 |     expect(requests).toHaveLength(1);
  55 |     expect(requests[0].searchParams.get('user_id')).toBe(`eq.${owner}`);
  56 |     expect(requests[0].searchParams.get('id')).toBe(`eq.${snapshot}`);
  57 |     recovered=true;
  58 |     await control.selectOption(purpose==='ranking'?'current':'');
  59 |     await control.selectOption(String(timestamp));
  60 |     await expect.poll(()=>requests.length).toBe(2);
  61 |     if(purpose==='ranking') await expect(page.locator('.v2-ranked-song strong').filter({hasText:'Recovered song'})).toBeVisible();
  62 |     else await expect(page.locator('.v2-ranked-song strong').filter({hasText:'Test Song'})).toBeVisible();
  63 |     await expectNoBlockingAxeViolations(page);
  64 |     expect(requests).toHaveLength(2);
  65 |   });
  66 | }
  67 | 
```