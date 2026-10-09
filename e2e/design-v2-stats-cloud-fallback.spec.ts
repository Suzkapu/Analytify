import {test,expect} from './fixtures';
import {mockSpotify,seedAuthenticatedBrowser,expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
import type {Route} from '@playwright/test';

for(const stale of [false,true])for(const motion of ['no-preference','reduce'] as const){
  test(`cloud-restored Stats cache preserves rankings and uses only necessary retrieval, stale=${stale} (${motion})`,async({page},info)=>{
    await page.clock.setFixedTime(new Date('2026-10-08T12:00:00Z'));await page.emulateMedia({reducedMotion:motion});
    await mockSpotify(page);await seedAuthenticatedBrowser(page,{cloudIdentity:true});
    await page.evaluate(async()=>{
      await new Promise<void>((resolve,reject)=>{
        const request=indexedDB.open('AnalytifyDB',4);request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{const db=request.result,tx=db.transaction('appData','readwrite');
          tx.objectStore('appData').put({key:'de111111-1111-4111-8111-111111111111_backup_active',value:'true'});
          tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
      });
    });
    let cloudReads=0,normalizedReads=0;const artistRequests:Route[]=[];
    await page.route('https://api.spotify.com/v1/me/top/artists?*',route=>{artistRequests.push(route);});
    await page.route('https://tmmhylpexbubyznlizfs.supabase.co/**',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/rest/v1/user_cache'&&route.request().method()==='GET'){
        cloudReads++;expect(url.searchParams.get('user_id')).toBe('eq.de111111-1111-4111-8111-111111111111');
        const filter=url.searchParams.get('key')!;expect(filter).toMatch(/^in\.\(.+\)$/);
        const keys=filter.slice(4,-1).split(',').map(key=>key.replace(/^"|"$/g,''));
        expect(keys).toHaveLength(4);expect(keys.every(key=>/^e2e-user(?:_dev)?_stats_short_term_(tracks|artists|genres|lastUpdated)$/.test(key))).toBe(true);
        return route.fulfill({json:keys.map(key=>({key,value:key.endsWith('_lastUpdated')
          ?String(stale?1:new Date('2026-10-08T12:00:00Z').getTime())
          :JSON.stringify(key.endsWith('_tracks')?[{id:'cloud-song',name:'Cloud restored song',artists:[{name:'Cloud artist'}],album:{images:[]}}]
            :key.endsWith('_artists')?[{id:'cloud-artist',name:'Cloud artist',genres:['pop'],images:[]}]
            :[{name:'pop',count:1,percentage:100}])}))});
      }
      if(url.pathname==='/rest/v1/stats_snapshots'&&url.searchParams.get('limit')==='1'){
        normalizedReads++;return route.fulfill({json:[]});
      }
      return route.fulfill({json:url.pathname==='/rest/v1/users'?{backup_active:true}:[]});
    });
    await page.goto('/new/stats');const main=page.getByRole('main');
    await expect(page.getByRole('status',{name:'Loading Analytify',exact:true})).toHaveCount(0);
    await expect(main.getByText('Cloud restored song',{exact:true})).toBeVisible();
    await expect.poll(()=>cloudReads).toBe(1);
    if(!stale){
      await expect(main.locator('v2-current-stats-feedback')).toHaveCount(0);
      expect(artistRequests).toHaveLength(0);expect(normalizedReads).toBe(0);
      await main.locator('.v2-page').screenshot({path:info.outputPath('cloud-cache-fresh.png')});
    }else{
      await expect(main.getByText('Refreshing this range… Your cached rankings stay visible.',{exact:true})).toBeVisible();
      await expect.poll(()=>artistRequests.length).toBe(1);expect(normalizedReads).toBe(1);
      await main.locator('.v2-page').screenshot({path:info.outputPath('cloud-cache-refreshing.png')});
      await artistRequests[0].fulfill({status:503,json:{error:{status:503,message:'Isolated cloud-cache refresh failure'}}});
      await expect(main.getByRole('alert')).toBeVisible();await expect(main.getByText('Cloud restored song',{exact:true})).toBeVisible();
      await expectNoBlockingAxeViolations(page);await main.locator('.v2-page').screenshot({path:info.outputPath('cloud-cache-refresh-failed.png')});
      await main.getByRole('button',{name:'Retry',exact:true}).press('Enter');
      await expect(main.getByText('Cloud restored song',{exact:true})).toBeVisible();
      await expect.poll(()=>artistRequests.length).toBe(2);expect(cloudReads).toBe(2);expect(normalizedReads).toBe(2);
      await artistRequests[1].fulfill({json:{items:[{id:'fresh-artist',name:'Fresh artist',genres:['pop'],images:[]}],total:1}});
      await expect(main.getByText('Test Song',{exact:true})).toBeVisible();await expect(main.getByText('Cloud restored song',{exact:true})).toHaveCount(0);
      await expect(main.getByRole('alert')).toHaveCount(0);await expect(main.getByRole('heading',{name:'Top songs',exact:true})).toBeFocused();
      expect(artistRequests).toHaveLength(2);
    }
    await expectNoBlockingAxeViolations(page);
  });
}
