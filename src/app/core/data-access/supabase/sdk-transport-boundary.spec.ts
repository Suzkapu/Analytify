import {createClient} from '@supabase/supabase-js';
import {describe, expect, it, vi} from 'vitest';
import {SupabaseService} from './supabase.service';
function setup(reply:(url:URL,init:RequestInit)=>Response|Promise<Response>){
  const transport=vi.fn(async(input:RequestInfo|URL,init:RequestInit={})=>{
    const url=new URL(input instanceof Request?input.url:String(input));
    expect(url.origin).toBe('https://supabase.fixture.invalid');
    return reply(url,init);
  });
  const client=createClient('https://supabase.fixture.invalid','fixture-public-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:transport as typeof fetch}});
  return {service:new SupabaseService(async()=>client),transport};
}
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
describe('real Supabase SDK isolated transport contracts',()=>{
  it('serializes owner and deduplicated key scopes into cache reads/deletes without widening another owner scope',async()=>{
    const requests:Array<{url:URL;method:string;body:unknown}>=[];
    const {service}=setup((url,init)=>{
      requests.push({url,method:init.method||'GET',body:init.body});
      expect(url.pathname).toBe('/rest/v1/user_cache');
      if(init.method!=='POST')expect(url.searchParams.get('user_id')).toBe('eq.owner');
      if(init.method==='POST')return json(null,201);
      if(init.method==='DELETE')return new Response(null,{status:204});
      return json([{key:'stats',value:'fixture-only',updated_at:'2026-10-16T12:00:00Z'}]);
    });
    await service.saveUserCache('owner','stats','fixture-only');
    expect(await service.loadUserCache('owner',['stats'])).toEqual([{key:'stats',value:'fixture-only',updated_at:'2026-10-16T12:00:00Z'}]);
    await service.deleteUserCacheEntries('owner',['','stats','stats']);
    expect(requests[1].url.searchParams.get('key')).toBe('in.(stats)');
    expect(requests[2].url.searchParams.get('key')).toBe('in.(stats)');
    expect(JSON.parse(requests[0].body as string)).toMatchObject({user_id:'owner',key:'stats',value:'fixture-only'});
  });
  it('ingests complete catalog dependencies over the SDK RPC transport before writing track relationships',async()=>{
    const ingested:any[]=[];
    const {service}=setup((url,init)=>{
      if(url.pathname==='/rest/v1/rpc/ingest_spotify_catalog'){
        const payload=JSON.parse(init.body as string);ingested.push(payload);return json(null);
      }
      expect(init.method).toBe('GET');expect(['artists','albums','tracks']).toContain(url.pathname.split('/').at(-1));return json([]);
    });
    await service.syncTracks([{id:'song',name:'Fixture song',albumId:'album',artists:[{id:'artist',name:'Fixture artist'}],external_urls:{spotify:'https://open.spotify.com/track/song'}}]);
    expect(ingested.map(value=>value.p_kind)).toEqual(['albums','artists','tracks']);
    expect(ingested[2]).toMatchObject({p_items:[{id:'song',album_id:'album',name:'Fixture song',spotify_url:'https://open.spotify.com/track/song'}],p_relationships:[{track_id:'song',artist_id:'artist',artist_rank:0}]});
  });
  it('propagates SDK database permission errors for mutations and keeps the next explicit cache read recoverable',async()=>{
    let available=false;
    const {service}=setup((_url,init)=>available?json([{key:'stats',value:'recovered'}]):json({code:'42501',message:'Fixture permission denied'},403));
    await expect(service.saveUserCache('owner','stats','value')).rejects.toMatchObject({code:'42501'});
    await expect(service.loadUserCache('owner')).resolves.toEqual([]);
    available=true;await expect(service.loadUserCache('owner')).resolves.toEqual([{key:'stats',value:'recovered'}]);
  });
});
