# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-search-copy.spec.ts >> canonical inline search preserves artist matching and native labels (reduce)
- Location: e2e/design-v2-stats-search-copy.spec.ts:4:61

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('main').getByText('pop', { exact: true }).first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('main').getByText('pop', { exact: true }).first() with timeout 5000ms
  - waiting for getByRole('main').getByText('pop', { exact: true }).first()

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
- main "Your Top Listening content":
  - heading "Your top listening" [level=1]
  - paragraph: Your songs, artists and genres, ranked over time.
  - region "Statistics controls":
    - paragraph: Period
    - group "Ranking period":
      - button "4 weeks" [pressed]
      - button "6 months"
      - button "1 year"
    - paragraph: Category
    - group "Ranking category":
      - button "Songs"
      - button "Artists"
      - button "Genres" [pressed]
  - group "Search rankings":
    - text: Search genres
    - searchbox "Search genres": pop
    - button "Compare dates"
    - switch "Search past rankings"
  - region "Rankings":
    - heading "Top genres" [level=2]
    - group "Genre shares":
      - strong: 1. pop
      - 'img "pop: 100%"'
      - text: 100%
      - button "View position history for pop": History
- contentinfo:
  - text: Powered by Spotify Artwork and metadata belong to their owners.
  - link "Legal & privacy":
    - /url: /new/legal
```

# Test source

```ts
  1  | import {test,expect} from './fixtures';
  2  | import {mockSpotify,seedAuthenticatedBrowser,expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
  3  | import {writeFile} from 'node:fs/promises';
  4  | for(const motion of ['no-preference','reduce'] as const)test(`canonical inline search preserves artist matching and native labels (${motion})`,async({page},info)=>{
  5  |   await page.emulateMedia({reducedMotion:motion});await mockSpotify(page);await seedAuthenticatedBrowser(page);
  6  |   let requests=0;await page.route('https://api.spotify.com/v1/me/top/**',async route=>{
  7  |     requests++;const url=new URL(route.request().url()),artists=url.pathname.endsWith('artists'),offset=Number(url.searchParams.get('offset'));
  8  |     await route.fulfill({json:{items:offset?[]:artists?[{id:'artist',name:'Neon Coast',genres:['pop'],images:[]}]
  9  |       :[{id:'song',name:'Midnight Drive',artists:[{name:'Neon Coast'}],album:{images:[]}}],total:1}});
  10 |   });
  11 |   await page.goto('/new/stats');await expect(page.getByRole('status',{name:'Loading Analytify',exact:true})).toHaveCount(0);
  12 |   const search=page.getByRole('searchbox',{name:'Search songs or artists',exact:true});
  13 |   await expect(page.locator('.v2-ranking-list strong')).toHaveText('Midnight Drive');expect(requests).toBe(4);
  14 |   await expect(search).toHaveAttribute('placeholder','Search songs');
  15 |   const association=await search.evaluate((el:HTMLInputElement)=>({labels:el.labels?.length,ids:document.querySelectorAll(`[id="${el.id}"]`).length}));
  16 |   expect(association).toEqual({labels:1,ids:1});
  17 |   const geometry=[];
  18 |   for(const width of [320,390,760,761,1440])for(const height of [480,1080]){
  19 |     await page.setViewportSize({width,height});await expect(search).toBeVisible();
  20 |     const icon=page.locator('v2-search-filters .v2-search__icon img');await expect(icon).toBeVisible();
  21 |     const sample=await search.evaluate(el=>{const field=el.parentElement!,slot=field.querySelector('.v2-search__icon')!,img=slot.querySelector('img')!,r=el.getBoundingClientRect(),s=slot.getBoundingClientRect(),g=img.getBoundingClientRect();
  22 |       return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,inputHeight:r.height,inputFont:getComputedStyle(el).fontSize,padding:getComputedStyle(el).paddingLeft,
  23 |         slotWidth:s.width,slotHeight:s.height,slotInset:s.left-r.left,iconWidth:g.width,iconHeight:g.height,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,loaded:img.complete,src:img.currentSrc};});
  24 |     expect(sample).toMatchObject({overflow:0,inputHeight:48,inputFont:'16px',padding:'42px',slotWidth:18,slotHeight:18,slotInset:17,iconWidth:20,iconHeight:20,naturalWidth:20,naturalHeight:20,loaded:true});
  25 |     expect(sample.src).toContain('/new/assets/design-v2/stats-search.svg');geometry.push(sample);
  26 |     if([390,1440].includes(width))await page.locator('v2-search-filters').screenshot({path:info.outputPath(`search-${width}-${height}.png`)});
  27 |   }
  28 |   await search.fill('  NEON  ');await expect(page.locator('.v2-ranking-list strong')).toHaveText('Midnight Drive');
  29 |   await search.fill('absent song');await expect(page.locator('.v2-ranking-list strong')).toHaveCount(0);await expect(page.getByText('No top songs found',{exact:true})).toBeVisible();
  30 |   await search.fill('');await expect(page.locator('.v2-ranking-list strong')).toHaveText('Midnight Drive');await expect(search).toBeFocused();
  31 |   await page.getByRole('group',{name:'Ranking category'}).getByRole('button',{name:'Artists',exact:true}).press('Enter');
  32 |   const artistSearch=page.getByRole('searchbox',{name:'Search artists',exact:true});await expect(artistSearch).toHaveAttribute('placeholder','Search artists');await artistSearch.fill('neon');
  33 |   await expect(page.locator('.v2-artist-rankings strong')).toHaveText('Neon Coast');
  34 |   await page.getByRole('group',{name:'Ranking category'}).getByRole('button',{name:'Genres',exact:true}).press('Enter');
  35 |   const genreSearch=page.getByRole('searchbox',{name:'Search genres',exact:true});await expect(genreSearch).toHaveValue('neon');await genreSearch.fill('pop');
> 36 |   await expect(page.getByRole('main').getByText('pop',{exact:true}).first()).toBeVisible();expect(requests).toBe(4);
     |                                                                              ^ Error: expect(locator).toBeVisible() failed
  37 |   await expectNoBlockingAxeViolations(page);await writeFile(info.outputPath('search-responsive-geometry.json'),JSON.stringify(geometry,null,2));
  38 | });
  39 | 
```