import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {SupabaseService} from './supabase.service';

type Query = {table: string; operation: string; values?: any; options?: any; columns?: string; filters: Array<[string, string, any]>; limit?: number; order?: any; single?: boolean; signal?: AbortSignal};
type Result = {data: any; error: any};
function fixture() {
  const tables = new Map<string, any[]>(['users', 'artists', 'albums', 'tracks', 'listening_history', 'stats_snapshots', 'user_cache'].map(name => [name, []]));
  const queries: Query[] = [];
  const rpcCalls: Array<{name: string; params: any}> = [];
  let respond: ((query: Query) => Result | undefined | Promise<Result | undefined>) | undefined;
  let rpcResponse: ((name: string, params: any) => Result | undefined | Promise<Result | undefined>) | undefined;
  const matches = (row: any, filters: Query['filters']) => filters.every(([op, field, value]) => op === 'eq' ? row[field] === value : op === 'in' ? value.includes(row[field]) : row[field] >= value);
  const client = {
    auth: {getSession: vi.fn().mockResolvedValue({data: {session: {access_token: 'isolated-session', user: {id: 'owner'}}}, error: null}), refreshSession: vi.fn().mockResolvedValue({error: null}), signInAnonymously: vi.fn().mockResolvedValue({data: {session: {access_token: 'anonymous-fixture', user: {id: 'anonymous-owner'}}}, error: null})},
    realtime: {setAuth: vi.fn().mockResolvedValue(undefined)},
    rpc: vi.fn(async (name: string, params: any) => {
      rpcCalls.push({name, params});
      const response = await rpcResponse?.(name, params);
      if (response) return response;
      expect(name).toBe('ingest_spotify_catalog');
      const rows = tables.get(params.p_kind)!;
      for (const item of params.p_items) {
        const existing = rows.find(row => row.id === item.id);
        if (existing) Object.assign(existing, item); else rows.push({...item});
      }
      return {data: null, error: null};
    }),
    from: vi.fn((table: string) => {
      expect(tables.has(table)).toBe(true);
      const query: Query = {table, operation: 'select', filters: []};
      const builder: any = {
        select: (columns: string) => {query.columns = columns; return builder;},
        eq: (field: string, value: any) => {query.filters.push(['eq', field, value]); return builder;},
        in: (field: string, value: any) => {query.filters.push(['in', field, value]); return builder;},
        gte: (field: string, value: any) => {query.filters.push(['gte', field, value]); return builder;},
        order: (field: string, options: any) => {query.order = {field, ...options}; return builder;},
        limit: (value: number) => {query.limit = value; return builder;},
        maybeSingle: () => {query.single = true; return builder;},
        update: (values: any) => {query.operation = 'update'; query.values = values; return builder;},
        delete: () => {query.operation = 'delete'; return builder;},
        upsert: (values: any, options: any) => {query.operation = 'upsert'; query.values = values; query.options = options; return builder;},
        abortSignal: (signal: AbortSignal) => {query.signal = signal; return builder;},
        then: (resolve: any, reject: any) => (async () => {
          queries.push(query);
          const override = await respond?.(query);
          if (override) return override;
          if (query.signal?.aborted) return {data: null, error: query.signal.reason};
          const rows = tables.get(table)!;
          let selected = rows.filter(row => matches(row, query.filters));
          if (query.order) selected.sort((a, b) => String(a[query.order.field]).localeCompare(String(b[query.order.field])) * (query.order.ascending ? 1 : -1));
          if (query.limit !== undefined) selected = selected.slice(0, query.limit);
          if (query.operation === 'delete') tables.set(table, rows.filter(row => !selected.includes(row)));
          if (query.operation === 'update') for (const row of selected) Object.assign(row, query.values);
          if (query.operation === 'upsert') for (const value of Array.isArray(query.values) ? query.values : [query.values]) {
            const keys = query.options?.onConflict?.split(',') || ['id'];
            const existing = rows.find(row => keys.every((key: string) => row[key] === value[key]));
            if (!existing) rows.push({...value}); else if (!query.options?.ignoreDuplicates) Object.assign(existing, value);
          }
          return {data: query.operation === 'select' ? query.single ? selected[0] || null : selected : null, error: null};
        })().then(resolve, reject)
      };
      return builder;
    })
  };
  const factory = vi.fn(async () => client as any);
  return {service: new SupabaseService(factory), client, factory, tables, queries, rpcCalls,
    reply: (callback: typeof respond) => {respond = callback;}, rpcReply: (callback: typeof rpcResponse) => {rpcResponse = callback;}};
}
const denied = {code: '42501', message: 'Isolated permission denied'};
const likedImage = 'https://misc.scdn.co/liked-songs/liked-songs-300.png';
beforeEach(() => {vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T12:00:00')); for (const method of ['log', 'warn', 'error', 'info'] as const) vi.spyOn(console, method).mockImplementation(() => {});});
afterEach(() => {vi.useRealTimers(); vi.restoreAllMocks();});

describe('collaboration session and owner-data boundaries', () => {
  it('creates a private collaboration identity only when no session exists and authenticates realtime before returning it', async () => {
    const f = fixture();
    f.client.auth.getSession.mockResolvedValue({data: {session: null}, error: null});
    await expect(f.service.ensureCollaborationSession()).resolves.toBe('anonymous-owner');
    expect(f.client.realtime.setAuth).toHaveBeenCalledExactlyOnceWith('anonymous-fixture');
    expect(f.queries).toEqual([]);
    expect(f.rpcCalls).toEqual([]);
  });
  it.each(['session', 'anonymous', 'missing-anonymous', 'realtime'])('rejects %s failure without advertising a usable collaboration identity', async failure => {
    const f = fixture();
    if (failure === 'session') f.client.auth.getSession.mockResolvedValue({data: {session: null}, error: denied});
    else f.client.auth.getSession.mockResolvedValue({data: {session: null}, error: null});
    if (failure === 'anonymous') f.client.auth.signInAnonymously.mockResolvedValue({data: {session: null}, error: denied});
    if (failure === 'missing-anonymous') f.client.auth.signInAnonymously.mockResolvedValue({data: {session: null}, error: null});
    if (failure === 'realtime') f.client.realtime.setAuth.mockRejectedValue(denied);
    await expect(f.service.ensureCollaborationSession()).rejects.toBeDefined();
    expect(f.queries).toEqual([]);
  });
  it('awaits realtime authentication before disclosing the existing identity', async () => {
    const f = fixture(); let release!: () => void;
    f.client.realtime.setAuth.mockReturnValue(new Promise<void>(resolve => {release = resolve;}));
    let ready = false;
    const pending = f.service.ensureCollaborationSession().then(id => {ready = true; return id;});
    await vi.waitFor(() => expect(f.client.realtime.setAuth).toHaveBeenCalled());
    expect(ready).toBe(false); release(); await expect(pending).resolves.toBe('owner');
    expect(f.client.auth.signInAnonymously).not.toHaveBeenCalled();
  });
  it('scopes backup settings and profile deletion to the requested owner', async () => {
    const f = fixture(); f.tables.set('users', [{id: 'owner', backup_active: false, display_name: 'Owner'}, {id: 'other', backup_active: true}]);
    await expect(f.service.checkBackupActive('owner')).resolves.toBe(false);
    await f.service.updateBackupActive('owner', true);
    await expect(f.service.checkBackupActive('owner')).resolves.toBe(true);
    expect(await f.service.loadUserProfile('owner')).toMatchObject({id: 'owner', display_name: 'Owner'});
    await f.service.deleteUserProfileData('owner');
    expect(f.tables.get('users')).toEqual([{id: 'other', backup_active: true}]);
    expect(f.queries.every(q => q.filters.some(([,field,value]) => field === 'id' && value === 'owner'))).toBe(true);
  });
  it.each(['checkBackupActive', 'loadUserProfile', 'updateBackupActive', 'deleteUserProfileData'] as const)('handles denied %s operations without using accompanying data and permits retry', async method => {
    const f = fixture(); f.tables.set('users', [{id: 'owner', backup_active: true}]);
    f.reply(() => ({data: {backup_active: true, display_name: 'must-not-leak'}, error: denied}));
    if (method === 'checkBackupActive' || method === 'loadUserProfile') await expect(f.service[method]('owner')).resolves.toBeNull();
    else await expect(method === 'updateBackupActive' ? f.service.updateBackupActive('owner', false) : f.service.deleteUserProfileData('owner')).rejects.toBe(denied);
    expect(f.tables.get('users')).toHaveLength(1);
    f.reply(undefined);
    if (method === 'checkBackupActive') await expect(f.service.checkBackupActive('owner')).resolves.toBe(true);
    if (method === 'loadUserProfile') await expect(f.service.loadUserProfile('missing')).resolves.toBeNull();
    if (method === 'updateBackupActive') {await f.service.updateBackupActive('owner', false); expect(f.tables.get('users')![0].backup_active).toBe(false);}
    if (method === 'deleteUserProfileData') {await f.service.deleteUserProfileData('owner'); expect(f.tables.get('users')).toEqual([]);}
    await expect(f.service.checkBackupActive('missing')).resolves.toBeNull();
  });
});

describe('owner cache persistence and cancellation', () => {
  it('updates only the same owner/key while preserving another owner cache and restricting selected keys', async () => {
    const f = fixture(); f.tables.set('user_cache', [{user_id: 'other', key: 'stats', value: 'private'}]);
    await f.service.saveUserCache('owner', 'stats', 'first'); await f.service.saveUserCache('owner', 'stats', 'second'); await f.service.saveUserCache('owner', 'playlist', 'songs');
    expect(f.tables.get('user_cache')).toHaveLength(3);
    expect(await f.service.loadUserCache('owner', ['stats'])).toEqual([expect.objectContaining({key: 'stats', value: 'second'})]);
    expect(await f.service.loadUserCache('owner', [])).toHaveLength(2);
    expect(await f.service.loadUserCache('owner')).toHaveLength(2);
    await f.service.deleteUserCacheEntries('owner', ['', 'stats', 'stats']);
    expect(f.tables.get('user_cache')).toEqual([expect.objectContaining({user_id: 'other', value: 'private'}), expect.objectContaining({user_id: 'owner', key: 'playlist'})]);
    expect(f.queries.at(-1)?.filters).toEqual([['eq','user_id','owner'],['in','key',['stats']]]);
  });
  it('makes no query for empty deletion and rejects cancellation before obtaining a delete builder', async () => {
    const f = fixture(); await f.service.deleteUserCacheEntries('owner', ['', '']); expect(f.factory).not.toHaveBeenCalled();
    const controller = new AbortController(); const reason = new Error('Account changed'); controller.abort(reason);
    await expect(f.service.deleteUserCacheEntries('owner', ['stats'], controller.signal)).rejects.toBe(reason);
    expect(f.queries).toEqual([]);
  });
  it('forwards an active cancellation signal and exposes deletion errors rather than claiming success', async () => {
    const f = fixture(); const controller = new AbortController();
    f.reply(q => q.operation === 'delete' ? {data: null, error: denied} : undefined);
    await expect(f.service.deleteUserCacheEntries('owner', ['stats'], controller.signal)).rejects.toBe(denied);
    expect(f.queries[0].signal).toBe(controller.signal);
    f.reply(undefined); await expect(f.service.deleteUserCacheEntries('owner', ['stats'], controller.signal)).resolves.toBeUndefined();
  });
  it('propagates failed writes while treating unavailable reads as retryable cache misses', async () => {
    const f = fixture(); f.reply(() => ({data: [{key: 'private', value: 'must-not-leak'}], error: denied}));
    await expect(f.service.saveUserCache('owner', 'stats', 'value')).rejects.toBe(denied);
    await expect(f.service.loadUserCache('owner')).resolves.toEqual([]);
    f.reply(() => ({data: null, error: null})); await expect(f.service.loadUserCache('owner')).resolves.toEqual([]);
    f.reply(undefined); await f.service.saveUserCache('owner', 'stats', 'recovered'); expect((await f.service.loadUserCache('owner'))[0].value).toBe('recovered');
  });
});

describe('normalized artist read and catalog persistence', () => {
  it('avoids unbounded reads for absent artist identities and batches unique identities in hundreds', async () => {
    const f = fixture(); await expect(f.service.loadArtistById('')).resolves.toBeNull(); await expect(f.service.loadArtistsByIds([''])).resolves.toEqual([]); expect(f.factory).not.toHaveBeenCalled();
    const ids = Array.from({length: 205}, (_, i) => `artist-${i}`); f.tables.set('artists', ids.map((id, i) => ({id, name: id, image_url: i % 2 ? 'https://fixture.invalid/image' : null, spotify_url: i % 2 ? `https://open.spotify.com/artist/${id}` : null})));
    const artists = await f.service.loadArtistsByIds([...ids, '', ids[0]]); expect(artists).toHaveLength(205);
    expect(f.queries.map(q => q.filters[0][2].length)).toEqual([100,100,5]); expect(artists[0].images).toEqual([]); expect(artists[1].images).toHaveLength(1);
    expect(artists[0].external_urls).toBeUndefined(); expect(artists[1].external_urls.spotify).toContain('artist-1');
    expect((await f.service.loadArtistById('artist-1')).images).toHaveLength(1); expect((await f.service.loadArtistById('artist-0')).images).toEqual([]); await expect(f.service.loadArtistById('missing')).resolves.toBeNull();
  });
  it('does not return a partial artist batch when a later read fails and can recover on retry', async () => {
    const f = fixture(); f.tables.set('artists', [{id:'artist-0', name:'Known'}]);
    f.reply(q => q.filters[0]?.[2]?.includes?.('artist-100') ? {data:null,error:denied} : undefined);
    await expect(f.service.loadArtistsByIds(Array.from({length:101},(_,i)=>`artist-${i}`))).resolves.toEqual([]);
    f.reply(() => ({data: {id:'private'}, error:denied})); await expect(f.service.loadArtistById('artist-0')).resolves.toBeNull();
    f.reply(() => ({data:null,error:null})); await expect(f.service.loadArtistsByIds(['artist-0'])).resolves.toEqual([]);
    f.reply(undefined); expect((await f.service.loadArtistById('artist-0')).name).toBe('Known');
  });
  it('deduplicates artists, preserves real saved artwork when Spotify supplies a placeholder and sanitizes destinations', async () => {
    const f = fixture(); f.tables.set('artists', [{id:'existing',name:'Saved name',image_url:'https://fixture.invalid/saved',spotify_url:'https://open.spotify.com/artist/existing'}]);
    await f.service.syncArtists([null, {}, {id:'existing',images:[{url:likedImage}]}, {id:'new',name:'First'}, {id:'new',name:'Last',external_urls:{spotify:'https://attacker.invalid'}}]);
    expect(f.tables.get('artists')).toEqual([expect.objectContaining({id:'existing',name:'Saved name',image_url:'https://fixture.invalid/saved',spotify_url:'https://open.spotify.com/artist/existing'}), expect.objectContaining({id:'new',name:'Last',image_url:null,spotify_url:null})]);
    expect(f.rpcCalls[0].params.p_items).toHaveLength(2);
    await f.service.syncArtists([{id:'existing',name:'Should not replace'},{id:'missing'}],true);
    expect(f.tables.get('artists')!.find(row=>row.id==='existing')!.name).toBe('Saved name'); expect(f.tables.get('artists')!.find(row=>row.id==='missing')!.name).toBe('Unknown Artist');
    f.rpcCalls.length=0; await f.service.syncArtists([{id:'existing'}],true); expect(f.rpcCalls).toEqual([]);
  });
  it.each(['syncArtists','syncAlbums','syncTracks'] as const)('%s skips empty/invalid identities and fails on permission errors before catalog persistence', async method => {
    const f=fixture(); for(const data of [null,[],[null,{}]]) await f.service[method](data as any); expect(f.factory).not.toHaveBeenCalled();
    f.reply(()=>({data:[{id:'must-not-leak'}],error:denied})); await expect(f.service[method]([{id:'item'}])).rejects.toBe(denied); expect(f.rpcCalls).toEqual([]);
    f.reply(undefined); f.rpcReply(()=>({data:null,error:denied})); await expect(f.service[method]([{id:'item'}])).rejects.toBe(denied); expect(f.tables.get(method==='syncArtists'?'artists':method==='syncAlbums'?'albums':'tracks')).toEqual([]);
    f.rpcReply(undefined); await expect(f.service[method]([{id:'item'}])).resolves.toBeUndefined();
  });
});

describe('catalog metadata preservation, placeholders and dependency failures', () => {
  it('normalizes album dates and shape aliases while retaining richer saved metadata and deduplicating artist dependencies', async () => {
    const f=fixture(); f.tables.set('albums',[{id:'saved',name:'Saved album',album_type:'single',total_tracks:9,release_date:'2020-03-02',release_date_precision:'day',image_url:'https://fixture.invalid/saved',spotify_url:'https://open.spotify.com/album/saved',restriction_reason:'market',upc:'old-upc',ean:'old-ean'}]);
    f.tables.set('artists',[{id:'known',name:'Known'}]);
    await f.service.syncAlbums([null,{}, {id:'saved',images:[{url:likedImage}],release_date:'  '},
      {id:'year',name:'Year',release_date:'2024',artists:[{id:'missing',name:'Guest'},{}, {id:'known'}]},
      {id:'month',albumType:'compilation',totalTracks:0,release_date:'2024-05',releaseDatePrecision:'month',imageUrl:'https://fixture.invalid/month',spotifyUrl:'https://open.spotify.com/album/month',artists:[{id:'missing'}]},
      {id:'day',release_date:'2024-05-13',image_url:'https://fixture.invalid/day',spotify_url:'https://open.spotify.com/album/day',restrictions:{reason:'product'},external_ids:{upc:'upc',ean:'ean'}},
      {id:'new',name:'First'},{id:'new',name:'Last',upc:'flat-upc',ean:'flat-ean'}, {id:'nameless',artists:[{id:'nameless-artist'}]}]);
    const albums=f.tables.get('albums')!;
    expect(albums.find(row=>row.id==='saved')).toMatchObject({name:'Saved album',album_type:'single',total_tracks:9,release_date:'2020-03-02',image_url:'https://fixture.invalid/saved',restriction_reason:'market',upc:'old-upc',ean:'old-ean'});
    expect(albums.find(row=>row.id==='year')).toMatchObject({name:'Year',release_date:'2024-01-01',release_date_precision:'year'});
    expect(albums.find(row=>row.id==='month')).toMatchObject({album_type:'compilation',total_tracks:0,release_date:'2024-05-01',release_date_precision:'month',image_url:'https://fixture.invalid/month',spotify_url:'https://open.spotify.com/album/month'});
    expect(albums.find(row=>row.id==='day')).toMatchObject({release_date:'2024-05-13',image_url:'https://fixture.invalid/day',upc:'upc',ean:'ean',restriction_reason:'product'});
    expect(albums.find(row=>row.id==='new')).toMatchObject({name:'Last',upc:'flat-upc',ean:'flat-ean'});
    expect(albums.find(row=>row.id==='nameless')).toMatchObject({name:'Unknown Album',total_tracks:1,release_date:null,image_url:null,spotify_url:null});
    expect(f.tables.get('artists')!.find(row=>row.id==='missing')).toMatchObject({name:'Guest'}); expect(f.tables.get('artists')!.find(row=>row.id==='nameless-artist')).toMatchObject({name:'Unknown Artist'});
    expect(f.rpcCalls.map(call=>call.params.p_kind)).toEqual(['artists','albums']);
    expect(f.rpcCalls[1].params.p_relationships).toContainEqual({album_id:'year',artist_id:'known'});
    f.rpcCalls.length=0; await f.service.syncAlbums([{id:'saved'}],true); expect(f.rpcCalls).toEqual([]);
    await f.service.syncAlbums([{id:'saved',name:'Do not overwrite'},{id:'insert-only',artists:[{id:'known'}]}],true); expect(albums.find(row=>row.id==='saved')!.name).toBe('Saved album'); expect(albums.find(row=>row.id==='insert-only')).toBeDefined();
  });
  it('preserves saved track metadata, accepts explicit false/zero overrides and retains artist credit order', async () => {
    const f=fixture(); const previous={id:'saved',name:'Saved track',album_id:'saved-album',duration_ms:9000,explicit:true,spotify_url:'https://open.spotify.com/track/saved',track_number:7,disc_number:2,is_playable:false,is_local:true,isrc:'saved-isrc',restriction_reason:'market'};
    f.tables.set('tracks',[previous]); f.tables.set('albums',[{id:'known-album'}]); f.tables.set('artists',[{id:'known-artist'}]);
    await f.service.syncTracks([null,{}, {id:'saved'}, {id:'rich',name:'First'},
      {id:'rich',name:'Last',duration_ms:0,explicit:false,track_number:0,disc_number:0,is_playable:true,is_local:false,album:{id:'known-album'},artists:[{id:'known-artist'},{},{id:'guest',name:'Guest'}],external_urls:{spotify:'https://open.spotify.com/track/rich'},external_ids:{isrc:'new-isrc'},restrictions:{reason:'product'}},
      {id:'aliases',albumId:'new-album',durationMs:5,trackNumber:4,discNumber:3,spotifyUrl:'https://open.spotify.com/track/aliases',artists:[{id:'nameless'}]},
      {id:'bare',spotify_url:'https://attacker.invalid'},
      {id:'album-cover',album:{id:'image-album',name:'Album name',imageUrl:'https://fixture.invalid/image'}}]);
    const tracks=f.tables.get('tracks')!;
    expect(tracks.find(row=>row.id==='saved')).toMatchObject(previous);
    expect(tracks.find(row=>row.id==='rich')).toMatchObject({name:'Last',duration_ms:0,explicit:false,track_number:0,disc_number:0,is_playable:true,is_local:false,isrc:'new-isrc',restriction_reason:'product'});
    expect(tracks.find(row=>row.id==='aliases')).toMatchObject({album_id:'new-album',duration_ms:5,track_number:4,disc_number:3,spotify_url:'https://open.spotify.com/track/aliases'});
    expect(tracks.find(row=>row.id==='bare')).toMatchObject({name:'Unknown Track',album_id:null,duration_ms:0,explicit:false,track_number:1,disc_number:1,is_playable:true,is_local:false,isrc:null,restriction_reason:null,spotify_url:null});
    expect(f.tables.get('albums')!.find(row=>row.id==='new-album')).toMatchObject({name:'Unknown Album',image_url:null});
    expect(f.tables.get('albums')!.find(row=>row.id==='image-album')).toMatchObject({name:'Album name',image_url:'https://fixture.invalid/image'});
    expect(f.tables.get('artists')!.find(row=>row.id==='nameless')).toMatchObject({name:'Unknown Artist'});
    expect(f.rpcCalls.map(call=>call.params.p_kind)).toEqual(['albums','artists','tracks']);
    expect(f.rpcCalls[2].params.p_relationships).toEqual([{track_id:'rich',artist_id:'known-artist',artist_rank:0},{track_id:'rich',artist_id:'guest',artist_rank:2},{track_id:'aliases',artist_id:'nameless',artist_rank:0}]);
    f.rpcCalls.length=0; await f.service.syncTracks([{id:'saved'}],true); expect(f.rpcCalls).toEqual([]);
    await f.service.syncTracks([{id:'saved',name:'Do not overwrite'},{id:'new-only',album:{id:'known-album'},artists:[{id:'known-artist'}]}],true); expect(tracks.find(row=>row.id==='saved')!.name).toBe('Saved track');
  });
  it('accepts alternate artist image and destination field shapes without replacing good images with empty placeholders', async () => {
    const f=fixture(); f.reply(q=>q.table==='artists'?{data:null,error:null}:undefined);
    await f.service.syncArtists([{id:'camel',imageUrl:'https://fixture.invalid/camel',spotifyUrl:'https://open.spotify.com/artist/camel'},{id:'snake',image_url:'https://fixture.invalid/snake',spotify_url:'https://open.spotify.com/artist/snake'},{id:'placeholder',images:[{url:likedImage}]}]);
    expect(f.tables.get('artists')).toEqual([expect.objectContaining({id:'camel',image_url:'https://fixture.invalid/camel',spotify_url:'https://open.spotify.com/artist/camel'}),expect.objectContaining({id:'snake',image_url:'https://fixture.invalid/snake',spotify_url:'https://open.spotify.com/artist/snake'}),expect.objectContaining({id:'placeholder',image_url:null})]);
  });
  it.each(['album-artists','track-albums','track-artists'])('does not publish catalog records after a denied %s dependency read and supports retry', async failure => {
    const f=fixture();
    const album={id:'album',artists:[{id:'artist',name:'Artist'}]}; const track={id:'track',album,artists:[{id:'artist',name:'Artist'}]};
    f.reply(q=>q.columns==='id'&&q.table===(failure==='track-albums'?'albums':'artists')?{data:null,error:denied}:undefined);
    await expect(failure==='album-artists'?f.service.syncAlbums([album]):f.service.syncTracks([track])).rejects.toBe(denied);
    expect(f.tables.get(failure==='album-artists'?'albums':'tracks')).toEqual([]);
    f.reply(undefined); await expect(failure==='album-artists'?f.service.syncAlbums([album]):f.service.syncTracks([track])).resolves.toBeUndefined();
  });
  it('treats null dependency inventories as missing catalog entries and creates placeholders before foreign-key links', async () => {
    const f=fixture(); f.reply(q=>q.operation==='select'?{data:null,error:null}:undefined);
    await f.service.syncAlbums([{id:'album',artists:[{id:'artist'}]}]); await f.service.syncTracks([{id:'track',album:{id:'other-album',images:[{url:'https://fixture.invalid/cover'}]},artists:[{id:'other-artist'}]}]);
    expect(f.tables.get('albums')).toHaveLength(2); expect(f.tables.get('artists')).toHaveLength(2); expect(f.tables.get('tracks')).toHaveLength(1);
  });
});

describe('listening history synchronization and private read mapping', () => {
  const lead={id:'lead',name:'Lead'}; const guest={id:'guest',name:'Guest'};
  const album={id:'album',name:'Album',artists:[lead,guest]};
  const track={id:'track',name:'Song',album,artists:[lead,guest]};
  it('deduplicates catalog dependencies and listens by owner, time and track without changing another listener history', async () => {
    const f=fixture(); f.tables.set('listening_history',[{user_id:'other',track_id:'track',played_at:'2026-10-16T10:00:00Z'}]);
    const listen={track,played_at:'2026-10-16T10:00:00Z'};
    await f.service.syncListeningHistory('owner',[listen,listen,{track:{id:'bare'},played_at:'2026-10-16T11:00:00Z',artists:[{id:'direct',name:'Direct'},null,{}]}, {trackId:'flat',played_at:'2026-10-16T11:30:00Z'},{track:null},{trackId:'no-time'}]);
    expect(f.tables.get('listening_history')).toHaveLength(4);
    expect(f.tables.get('listening_history')!.filter(row=>row.user_id==='owner').map(row=>row.track_id)).toEqual(['track','bare','flat']);
    expect(f.tables.get('artists')!.map(row=>row.id)).toEqual(['lead','guest','direct']);
    expect(f.client.auth.refreshSession).not.toHaveBeenCalled();
    await f.service.syncListeningHistory('owner',[listen]); expect(f.tables.get('listening_history')).toHaveLength(4);
    const historyWrite=f.queries.find(q=>q.operation==='upsert'&&q.table==='listening_history')!;
    expect(historyWrite.options).toEqual({onConflict:'user_id,played_at,track_id',ignoreDuplicates:true});
    expect(f.rpcCalls.slice(0,3).map(call=>call.params.p_kind)).toEqual(['artists','albums','tracks']);
  });
  it('skips absent listening inputs and entries without a usable identity or timestamp', async () => {
    const f=fixture(); await f.service.syncListeningHistory('owner',[]); await f.service.syncListeningHistory('owner',null as any); expect(f.factory).not.toHaveBeenCalled();
    await f.service.syncListeningHistory('owner',[{track:null},{track:{}}]); expect(f.queries).toEqual([]);
    await f.service.syncListeningHistory('',[{trackId:'track',played_at:'2026-10-16T10:00:00Z'}]); expect(f.queries).toEqual([]);
  });
  it.each(['missing','session-error','refresh-error','throws'])('attempts session recovery for %s and still propagates the database permission decision', async condition => {
    const f=fixture(); f.client.auth.getSession.mockResolvedValue({data:{session:null},error:condition==='session-error'?denied:null});
    if(condition==='refresh-error') f.client.auth.refreshSession.mockResolvedValue({error:denied});
    if(condition==='throws') f.client.auth.getSession.mockRejectedValue(new Error('Session storage unavailable'));
    f.reply(()=>({data:null,error:denied})); await expect(f.service.syncListeningHistory('owner',[{trackId:'flat',played_at:'2026-10-16T12:00:00Z'}])).rejects.toBe(denied);
    expect(f.client.auth.refreshSession).toHaveBeenCalledTimes(condition==='throws'?0:1); expect(f.tables.get('listening_history')).toEqual([]);
  });
  it('does not publish listens when catalog metadata fails and permits retry after the dependency recovers', async () => {
    const f=fixture(); f.rpcReply(()=>({data:null,error:denied})); await expect(f.service.syncListeningHistory('owner',[{track,played_at:'2026-10-16T10:00:00Z'}])).rejects.toBe(denied);
    expect(f.queries.some(q=>q.table==='listening_history')).toBe(false);
    f.rpcReply(undefined); await f.service.syncListeningHistory('owner',[{track,played_at:'2026-10-16T10:00:00Z'}]); expect(f.tables.get('listening_history')).toHaveLength(1);
  });
  it('limits private history to recent owner rows and reconstructs ranked artists while dropping deleted tracks', async () => {
    const f=fixture();
    f.tables.set('listening_history',[{user_id:'other',played_at:'2026-10-16T13:00:00Z',tracks:{id:'private'}},{user_id:'owner',played_at:'2026-10-16T12:00:00Z',tracks:null},{user_id:'owner',played_at:'2026-10-16T11:00:00Z',tracks:{id:'bare'}},{user_id:'owner',played_at:'2026-10-16T10:00:00Z',tracks:{id:'track',name:'Song',duration_ms:5,explicit:true,spotify_url:'https://open.spotify.com/track/track',albums:{id:'album',name:'Album',image_url:'https://fixture.invalid/cover'},track_artists:[{artist_rank:1,artists:guest},{artists:lead},{artist_rank:2,artists:null}]}}]);
    const history=await f.service.loadListeningHistoryFromDB('owner'); expect(history).toHaveLength(2); expect(history[0].track).toMatchObject({id:'bare',album:{images:[]},artists:[]});
    expect(history[1]).toMatchObject({played_at:'2026-10-16T10:00:00Z',track:{id:'track',explicit:true,album:{images:[{url:'https://fixture.invalid/cover'}]},artists:[lead,guest]}});
    expect(f.queries[0]).toMatchObject({filters:[['eq','user_id','owner']],order:{field:'played_at',ascending:false},limit:50});
  });
  it('does not leak history after a denied query, missing response or failed client initialization', async () => {
    const f=fixture(); f.reply(()=>({data:[{tracks:{id:'private'}}],error:denied})); await expect(f.service.loadListeningHistoryFromDB('owner')).resolves.toEqual([]);
    f.reply(()=>({data:null,error:null})); await expect(f.service.loadListeningHistoryFromDB('owner')).resolves.toEqual([]);
    f.factory.mockRejectedValueOnce(new Error('Offline')); const fresh=new SupabaseService(f.factory); await expect(fresh.loadListeningHistoryFromDB('owner')).resolves.toEqual([]);
    f.reply(undefined); await expect(fresh.loadListeningHistoryFromDB('owner')).resolves.toEqual([]);
  });
  it('checks only today for owner history and the range-specific retained snapshot window', async () => {
    const f=fixture(); f.tables.set('listening_history',[{user_id:'other',played_at:'2026-10-16T10:00:00Z'},{user_id:'owner',played_at:new Date(new Date('2026-10-16T00:00:00').getTime()-1).toISOString()}]);
    await expect(f.service.hasHistoryForToday('owner')).resolves.toBe(false);
    f.tables.get('listening_history')!.push({user_id:'owner',played_at:'2026-10-16T10:00:00Z'}); await expect(f.service.hasHistoryForToday('owner')).resolves.toBe(true);
    expect(f.queries[0]).toMatchObject({filters:[['eq','user_id','owner'],['gte','played_at',new Date('2026-10-16T00:00:00').toISOString()]],limit:1});
    f.tables.set('stats_snapshots',[{id:'snapshot',user_id:'owner',range:'long_term',snapshot_date:'2026-10-14'}]);
    await expect(f.service.hasRecentStatsSnapshot('owner','long_term',3)).resolves.toBe(true); await expect(f.service.hasRecentStatsSnapshot('owner','long_term',1)).resolves.toBe(false);
    f.reply(()=>({data:[{id:'private'}],error:denied})); await expect(f.service.hasHistoryForToday('owner')).resolves.toBe(false); await expect(f.service.hasRecentStatsSnapshot('owner','long_term',3)).resolves.toBe(false);
  });
});

describe('full saved snapshot owner scoping and normalized relation recovery', () => {
  const savedSnapshot=()=>({id:'snapshot',user_id:'owner',range:'long_term',snapshot_date:'2026-10-15',created_at:'2026-10-15T20:00:00Z',explicit_percentage:'25',genre_diversity:3,
    stats_snapshot_tracks:[{rank:3,tracks:null},{rank:2,tracks:{id:'bare',name:'Bare'}},{rank:1,tracks:{id:'song',name:'Song',duration_ms:120,explicit:true,spotify_url:'https://open.spotify.com/track/song',albums:{id:'album',name:'Album',image_url:'https://fixture.invalid/cover'},track_artists:[{artist_rank:2,artists:{id:'guest',name:'Guest'}},{artist_rank:1,artists:{id:'lead',name:'Lead'}},{artists:null}]}}],
    stats_snapshot_artists:[{rank:3,artists:null},{rank:2,artists:{id:'bare-artist',name:'Bare artist'}},{rank:1,artists:{id:'lead',name:'Lead',image_url:'https://fixture.invalid/lead',spotify_url:'https://open.spotify.com/artist/lead'}}],
    stats_snapshot_genres:[{rank:2,genre_name:'Pop',weight:100},{rank:1,genre_name:'Rock',weight:200}]});
  it.each(['all','single'])('restores %s saved snapshots with stable owner/range identities, ranked catalog and actual genre percentages',async mode=>{
    const f=fixture();f.tables.set('stats_snapshots',[savedSnapshot(),{...savedSnapshot(),id:'private',user_id:'other'}]);
    const result=mode==='all'?(await f.service.loadAllStatsSnapshots('owner','long_term'))[0]:await f.service.loadStatsSnapshotById('owner','snapshot');
    expect(result).toMatchObject({userId:'owner',range:'long_term',snapshotDate:'2026-10-15',timestamp:new Date(2026,9,15).getTime(),explicitPercentage:25,genreDiversity:3});
    expect(result.topTracks.map((track:any)=>track.id)).toEqual(['song','bare']);
    expect(result.topTracks[0]).toMatchObject({albumCover:'https://fixture.invalid/cover',spotifyUrl:'https://open.spotify.com/track/song',album:{images:[{url:'https://fixture.invalid/cover'}]},artists:[{id:'lead',name:'Lead'},{id:'guest',name:'Guest'}]});
    expect(result.topTracks[1]).toMatchObject({albumCover:null,album:{images:[]},artists:[]});
    expect(result.topArtists).toEqual([{id:'lead',name:'Lead',external_urls:{spotify:'https://open.spotify.com/artist/lead'},images:[{url:'https://fixture.invalid/lead'}]},{id:'bare-artist',name:'Bare artist',external_urls:{spotify:undefined},images:[]}]);
    expect(result.topGenres).toEqual([{name:'Rock',count:200,percentage:67},{name:'Pop',count:100,percentage:33}]);
    if(mode==='single'){expect(result).toMatchObject({id:'snapshot',isLoaded:true});expect(f.queries[0].filters).toEqual([['eq','id','snapshot'],['eq','user_id','owner']]);}
    else expect(f.queries[0]).toMatchObject({filters:[['eq','user_id','owner'],['eq','range','long_term']],order:{field:'snapshot_date',ascending:true}});
  });
  it('returns empty normalized rankings for snapshots with missing relations and honors legacy created-at dates',async()=>{
    const f=fixture();f.tables.set('stats_snapshots',[{id:'legacy',user_id:'owner',range:'short_term',created_at:'2026-10-15T10:00:00Z',explicit_percentage:0}]);
    expect((await f.service.loadAllStatsSnapshots('owner','short_term'))[0]).toMatchObject({timestamp:Date.parse('2026-10-15T10:00:00Z'),topTracks:[],topArtists:[],topGenres:[]});
    expect(await f.service.loadStatsSnapshotById('owner','legacy')).toMatchObject({topTracks:[],topArtists:[],topGenres:[]});
    await expect(f.service.loadStatsSnapshotById('other','legacy')).resolves.toBeNull();
  });
  it('keeps successful empty full-history reads separate from backend failure without returning failed data',async()=>{
    const f=fixture();f.reply(()=>({data:null,error:null}));await expect(f.service.loadAllStatsSnapshots('owner','short_term')).resolves.toEqual([]);await expect(f.service.loadStatsSnapshotById('owner','missing')).resolves.toBeNull();
    f.reply(()=>({data:[savedSnapshot()],error:denied}));await expect(f.service.loadAllStatsSnapshots('owner','long_term')).resolves.toEqual([]);await expect(f.service.loadStatsSnapshotById('owner','snapshot')).resolves.toBeNull();
    f.reply(undefined);f.tables.set('stats_snapshots',[savedSnapshot()]);expect(await f.service.loadStatsSnapshotById('owner','snapshot')).toMatchObject({id:'snapshot'});
  });
  it('retains zero-weight and sparse percentage genres without dividing by an absent total',async()=>{
    const f=fixture();f.tables.set('stats_snapshots',[{id:'zero',user_id:'owner',range:'long_term',snapshot_date:'2026-10-15',stats_snapshot_genres:[{rank:1,genre_name:'No weight',weight:0},{rank:2,genre_name:'Also zero',weight:0}]}]);
    expect((await f.service.loadStatsSnapshotById('owner','zero')).topGenres).toEqual([{name:'No weight',count:0,percentage:0},{name:'Also zero',count:0,percentage:0}]);
  });
});

describe('boolean availability contracts',()=>{
  it.each(['history','snapshot'])('returns false for a successful null %s response',async kind=>{
    const f=fixture();f.reply(()=>({data:null,error:null}));
    await expect(kind==='history'?f.service.hasHistoryForToday('owner'):f.service.hasRecentStatsSnapshot('owner','long_term',3)).resolves.toBe(false);
  });
});

describe('independent catalog credits and sparse snapshot identity recovery',()=>{
  it('includes album-only artists, preserves distinct listening identities and skips missing artist credits',async()=>{
    const f=fixture();
    const lead={id:'lead',name:'Lead'};const albumOnly={id:'album-only',name:'Album only'};
    await f.service.syncListeningHistory('owner',[{track:{id:'song',artists:[lead,lead,{}],album:{id:'album',artists:[lead,albumOnly,{}]}},played_at:'2026-10-16T10:00:00Z'},{track:{id:'bare',album:{id:'bare-album'}},played_at:'2026-10-16T11:00:00Z'}]);
    expect(f.tables.get('artists')!.map(row=>row.id)).toEqual(['lead','album-only']);
    expect(f.tables.get('listening_history')!.map(row=>row.track_id)).toEqual(['song','bare']);
  });
  it('collects independent top, track and album credits and retains rank identities when a song has only alternate artist fields',async()=>{
    const f=fixture();f.rpcReply(name=>name==='replace_stats_snapshot_v2'?{data:null,error:null}:undefined);
    await f.service.saveStatsSnapshot('owner','short_term',0,0,[
      {id:'credit',name:'Full credit',artists:[{id:'known',name:'Known'},{id:'credit',name:'Credit'},{}],album:{id:'album-credit',artists:[{id:'album-artist',name:'Album artist'}]}},
      {id:'bare-album',name:'Bare album',artists:[{}],album:{id:'bare-album'}},
      {id:'solo',name:'Acoustic',artist:'Solo'}, {id:'object',name:'Electric',artist:{name:'Object artist'}}, {id:'nameless'}
    ],[{id:'known',name:'Known'},{},null],[],false,'2026-10-15');
    expect(f.tables.get('artists')!.map(row=>row.id)).toEqual(['known','credit','album-artist']);
    const write=f.rpcCalls.find(call=>call.name==='replace_stats_snapshot_v2')!;
    expect(write.params.p_tracks).toEqual(['credit','bare-album','solo','object','nameless'].map((track_id,index)=>({track_id,rank:index+1})));
    expect(write.params.p_artists).toEqual([{artist_id:'known',rank:1}]);
    expect(f.queries.some(query=>query.columns==='range')).toBe(false);
  });
  it('does not advertise daily completeness when the post-commit range inventory has no data',async()=>{
    const f=fixture();f.rpcReply(name=>name==='replace_stats_snapshot_v2'?{data:null,error:null}:undefined);f.reply(query=>query.columns==='range'?{data:null,error:null}:undefined);
    await f.service.saveStatsSnapshot('owner','short_term',0,0,[],[],[]);
    expect(f.rpcCalls.at(-1)?.name).toBe('replace_stats_snapshot_v2');expect(f.queries.some(query=>query.operation==='update'&&query.table==='users')).toBe(false);
  });
  it('maps legacy absent artist-rank values to stable zero positions without losing a valid credit',async()=>{
    const f=fixture();f.tables.set('listening_history',[{user_id:'owner',played_at:'2026-10-16T10:00:00Z',tracks:{id:'song',track_artists:[{artists:{id:'first',name:'First'}},{artists:{id:'second',name:'Second'}}]}}]);
    expect((await f.service.loadListeningHistoryFromDB('owner'))[0].track.artists).toEqual([{id:'first',name:'First'},{id:'second',name:'Second'}]);
  });
});

it('rejects saved metadata with neither calendar date nor creation timestamp instead of exposing NaN as a history date',async()=>{
  const f=fixture();f.tables.set('stats_snapshots',[{id:'missing-date',user_id:'owner',range:'long_term'}]);
  await expect(f.service.loadAllStatsSnapshotsMetadata('owner','long_term')).rejects.toThrow('Invalid saved snapshot date.');
});
