import {test,expect} from './fixtures';
import {mockSpotify,seedAuthenticatedBrowser,expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
import {writeFile} from 'node:fs/promises';
for(const motion of ['no-preference','reduce'] as const)test(`canonical inline search preserves artist matching and native labels (${motion})`,async({page},info)=>{
  await page.emulateMedia({reducedMotion:motion});await mockSpotify(page);await seedAuthenticatedBrowser(page);
  let requests=0;await page.route('https://api.spotify.com/v1/me/top/**',async route=>{
    requests++;const url=new URL(route.request().url()),artists=url.pathname.endsWith('artists'),offset=Number(url.searchParams.get('offset'));
    await route.fulfill({json:{items:offset?[]:artists?[{id:'artist',name:'Neon Coast',genres:['pop'],images:[]}]
      :[{id:'song',name:'Midnight Drive',artists:[{name:'Neon Coast'}],album:{images:[]}}],total:1}});
  });
  await page.goto('/new/stats');await expect(page.getByRole('status',{name:'Loading Analytify',exact:true})).toHaveCount(0);
  const search=page.getByRole('searchbox',{name:'Search songs or artists',exact:true});
  await expect(page.locator('.v2-ranking-list strong')).toHaveText('Midnight Drive');expect(requests).toBe(4);
  await expect(search).toHaveAttribute('placeholder','Search songs');
  const association=await search.evaluate((el:HTMLInputElement)=>({labels:el.labels?.length,ids:document.querySelectorAll(`[id="${el.id}"]`).length}));
  expect(association).toEqual({labels:1,ids:1});
  await page.evaluate(()=>document.fonts.ready);
  const geometry=[];
  for(const width of [320,390,760,761,1440])for(const height of [480,1080]){
    await page.setViewportSize({width,height});await expect(search).toBeVisible();
    const icon=page.locator('v2-search-filters .v2-search__icon img');await expect(icon).toBeVisible();
    const sample=await search.evaluate(el=>{const field=el.parentElement!,slot=field.querySelector('.v2-search__icon')!,img=slot.querySelector('img')!,r=el.getBoundingClientRect(),s=slot.getBoundingClientRect(),g=img.getBoundingClientRect();
      return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,inputHeight:r.height,inputFont:getComputedStyle(el).fontSize,padding:getComputedStyle(el).paddingLeft,placeholderColor:getComputedStyle(el,'::placeholder').color,placeholderOpacity:getComputedStyle(el,'::placeholder').opacity,
        slotWidth:s.width,slotHeight:s.height,slotInset:s.left-r.left,iconWidth:g.width,iconHeight:g.height,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,loaded:img.complete,src:img.currentSrc};});
    expect(sample).toMatchObject({overflow:0,inputHeight:48,inputFont:'16px',padding:'42px',placeholderColor:'rgb(162, 173, 166)',placeholderOpacity:'1',slotWidth:18,slotHeight:18,slotInset:17,iconWidth:20,iconHeight:20,naturalWidth:20,naturalHeight:20,loaded:true});
    expect(sample.src).toContain('/new/assets/design-v2/stats-search.svg');geometry.push(sample);
    if([390,1440].includes(width))await page.locator('v2-search-filters').screenshot({path:info.outputPath(`search-${width}-${height}.png`)});
  }
  await search.fill('  NEON  ');await expect(page.locator('.v2-ranking-list strong')).toHaveText('Midnight Drive');
  await search.fill('absent song');await expect(page.locator('.v2-ranking-list strong')).toHaveCount(0);await expect(page.getByText('No top songs found',{exact:true})).toBeVisible();
  await search.press('ControlOrMeta+A');await search.press('Backspace');await expect(search).toHaveValue('');await expect(page.locator('.v2-ranking-list strong')).toHaveText('Midnight Drive');await expect(search).toBeFocused();
  await page.getByRole('group',{name:'Ranking category'}).getByRole('button',{name:'Artists',exact:true}).press('Enter');
  const artistSearch=page.getByRole('searchbox',{name:'Search artists',exact:true});await expect(artistSearch).toHaveAttribute('placeholder','Search artists');await artistSearch.fill('neon');
  await expect(page.locator('.v2-artist-rankings strong')).toHaveText('Neon Coast');
  await page.getByRole('group',{name:'Ranking category'}).getByRole('button',{name:'Genres',exact:true}).press('Enter');
  const genreSearch=page.getByRole('searchbox',{name:'Search genres',exact:true});await expect(genreSearch).toHaveValue('neon');await genreSearch.fill('pop');
  await expect(page.getByRole('group',{name:'Genre shares'}).locator('strong')).toHaveText('1. pop');expect(requests).toBe(4);
  await expectNoBlockingAxeViolations(page);await writeFile(info.outputPath('search-responsive-geometry.json'),JSON.stringify(geometry,null,2));
});
