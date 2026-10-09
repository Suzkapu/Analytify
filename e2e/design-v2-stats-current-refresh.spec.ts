import {test,expect} from './fixtures';
import {mockSpotify,seedAuthenticatedBrowser,expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
import {writeFile} from 'node:fs/promises';

for(const motion of ['no-preference','reduce'] as const) for(const moveFocus of [false,true]) {
  test(`cached Stats failure preserves complete rows and recovers without duplicate requests or stolen focus (${motion}, moved=${moveFocus})`,async({page},info)=>{
    await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));await page.emulateMedia({reducedMotion:motion});
    await mockSpotify(page);await seedAuthenticatedBrowser(page);
    await page.evaluate(async()=>{
      await new Promise<void>((resolve,reject)=>{
        const request=indexedDB.open('AnalytifyDB',4);request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{
          const db=request.result,tx=db.transaction(['featureData','appData'],'readwrite');
          for(const userId of ['e2e-user','e2e-user_dev']){
            const parts={tracks:[{id:'cached-song',name:'Cached song',artists:[{name:'Cached artist'}],album:{images:[]}}],
              artists:[{id:'cached-artist',name:'Cached artist',genres:['pop'],images:[]}],genres:[{name:'pop',count:1,percentage:100}]};
            for(const [part,value] of Object.entries(parts))tx.objectStore('featureData').put({key:`${userId}_stats_short_term_${part}`,value:JSON.stringify(value)});
            tx.objectStore('appData').put({key:`${userId}_stats_short_term_lastUpdated`,value:String(Date.now()-2*86400000)});
          }
          tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
        };
      });
    });
    let finishInitial!:()=>void,finishRetry!:()=>void;
    const initial=new Promise<void>(resolve=>finishInitial=resolve),retry=new Promise<void>(resolve=>finishRetry=resolve);
    let requests=0;
    await page.route('https://api.spotify.com/v1/me/top/artists?*',async route=>{
      requests++;
      if(requests===1){await initial;return route.fulfill({status:403,json:{error:{status:403,message:'Isolated stale-refresh failure'}}});}
      await retry;return route.fulfill({json:{items:[{id:'fresh-artist',name:'Fresh artist',genres:['pop'],images:[]}],total:1}});
    });
    await page.goto('/new/stats');const main=page.getByRole('main');
    await expect(main.getByText('Cached song',{exact:true})).toBeVisible();
    await expect(main.getByText('Refreshing this range… Your cached rankings stay visible.',{exact:true})).toBeVisible();
    await expect.poll(()=>requests).toBe(1);await main.locator('.v2-page').screenshot({path:info.outputPath('cached-refreshing.png')});
    finishInitial();await expect(main.getByRole('alert')).toBeVisible();
    await expect(main.getByText('Cached song',{exact:true})).toBeVisible();
    await expect(main.getByText('Could not refresh this range',{exact:true})).toBeVisible();
    await expectNoBlockingAxeViolations(page);await main.locator('.v2-page').screenshot({path:info.outputPath('cached-refresh-failed.png')});
    const originalViewport=page.viewportSize()!;
    const safeAreaSamples=[];
    for(const width of [320,390,760,761])for(const height of [480,1080]){
      await page.setViewportSize({width,height});
      await expect.poll(()=>page.evaluate(()=>({width:innerWidth,height:innerHeight,compact:matchMedia('(max-width:760px)').matches}))).toEqual({width,height,compact:width<=760});
      const action=main.getByRole('button',{name:'Create playlist from these songs',exact:true});
      const measure=()=>action.evaluate(async el=>{
        await document.fonts.ready;
        window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'});
        await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
        const r=el.getBoundingClientRect(),nav=document.querySelector('.v2-mobile-nav')!,n=nav.getBoundingClientRect();
        return {width:innerWidth,height:innerHeight,action:{top:r.top,bottom:r.bottom,left:r.left,right:r.right},
          navVisible:getComputedStyle(nav).display!=='none',navTop:n.top,navBottom:n.bottom,overflow:document.documentElement.scrollWidth-innerWidth,
          scrollEndGap:Math.abs(document.documentElement.scrollHeight-innerHeight-scrollY),
          centerHitsAction:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
      });
      let sample!:Awaited<ReturnType<typeof measure>>;
      await expect.poll(async()=>{
        sample=await measure();
        return sample.scrollEndGap<=1&&sample.action.top>=0
          &&sample.action.bottom<=(sample.navVisible?sample.navTop:sample.height)
          &&(!sample.navVisible||(sample.navTop>=0&&sample.navBottom<=sample.height))&&sample.centerHitsAction;
      }).toBe(true);
      expect(sample.scrollEndGap).toBeLessThanOrEqual(1);
      expect(sample.navVisible).toBe(width<=760);expect(sample.action.left).toBeGreaterThanOrEqual(0);
      expect(sample.action.right).toBeLessThanOrEqual(width);expect(sample.overflow).toBe(0);safeAreaSamples.push(sample);
      await writeFile(info.outputPath('cached-action-safe-area.json'),JSON.stringify(safeAreaSamples,null,2));
      if(width===390&&height===480)await page.screenshot({path:info.outputPath('cached-scrolled-safe-area-390-480.png')});
    }
    await info.attach('cached-action-safe-area.json',{body:JSON.stringify(safeAreaSamples,null,2),contentType:'application/json'});
    await page.setViewportSize(originalViewport);
    await main.getByRole('button',{name:'Retry',exact:true}).press('Enter');
    await expect(main.getByText('Refreshing this range… Your cached rankings stay visible.',{exact:true})).toBeVisible();
    await expect(main.getByText('Cached song',{exact:true})).toBeVisible();
    await expect(main.locator('v2-current-stats-feedback section')).toBeFocused();
    await expect.poll(()=>requests).toBe(2);
    const search=main.getByRole('searchbox');if(moveFocus)await search.focus();
    finishRetry();await expect(main.getByText('Test Song',{exact:true})).toBeVisible();
    await expect(main.getByText('Cached song',{exact:true})).toHaveCount(0);await expect(main.getByRole('alert')).toHaveCount(0);
    expect(requests).toBe(2);
    if(moveFocus)await expect(search).toBeFocused();else await expect(main.getByRole('heading',{name:'Top songs',exact:true})).toBeFocused();
    await expectNoBlockingAxeViolations(page);
  });
}
