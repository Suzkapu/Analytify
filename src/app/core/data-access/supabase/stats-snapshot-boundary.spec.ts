import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {SupabaseService} from './supabase.service';

describe('latest saved Stats snapshot service boundary', () => {
  beforeEach(() => {vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-06T12:00:00'));});
  afterEach(() => {vi.useRealTimers();});

  function setup(data: any = null, error: any = null) {
    const query = {select: vi.fn().mockReturnThis(),eq: vi.fn().mockReturnThis(),gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),limit: vi.fn().mockReturnThis(),maybeSingle: vi.fn().mockResolvedValue({data,error})};
    const client = {from: vi.fn().mockReturnValue(query)};
    return {service: new SupabaseService(async () => client as any),client,query};
  }

  it('loads only the requested owner and range within the allowed freshness window', async () => {
    const {service,client,query} = setup({snapshot_date:'2026-10-05',explicit_percentage:20,genre_diversity:4});
    await expect(service.loadLatestStatsSnapshot('owner','medium_term',3)).resolves.toEqual({
      snapshotDate:'2026-10-05',explicitPercentage:20,genreDiversity:4,topTracks:[],topArtists:[],topGenres:[]
    });
    expect(client.from).toHaveBeenCalledExactlyOnceWith('stats_snapshots');
    expect(query.eq.mock.calls).toEqual([['user_id','owner'],['range','medium_term']]);
    expect(query.gte).toHaveBeenCalledExactlyOnceWith('snapshot_date','2026-10-04');
    expect(query.order).toHaveBeenCalledExactlyOnceWith('snapshot_date',{ascending:false});
    expect(query.limit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('reconstructs ranked Spotify identities and artwork while skipping deleted catalog relations', async () => {
    const {service} = setup({snapshot_date:'2026-10-05',stats_snapshot_tracks:[
      {rank:3,tracks:null},
      {rank:2,tracks:{id:'bare',name:'Unpictured',track_artists:[]}},
      {rank:1,tracks:{id:'song',name:'Midnight Drive',duration_ms:210000,explicit:false,spotify_url:'https://open.spotify.com/track/song',
        albums:{id:'album',name:'Album',image_url:'https://images.example/album'},
        track_artists:[{artist_rank:2,artists:{id:'guest',name:'Guest'}},{artist_rank:1,artists:{id:'lead',name:'Lead'}},{artist_rank:3,artists:null}]}}
    ],stats_snapshot_artists:[{rank:2,artists:{id:'bare-artist',name:'Unpictured Artist'}},{rank:3,artists:null},
      {rank:1,artists:{id:'lead',name:'Lead',image_url:'https://images.example/artist',spotify_url:'https://open.spotify.com/artist/lead'}}]});
    const result = await service.loadLatestStatsSnapshot('owner','short_term',1);
    expect(result.topTracks.map((track: any) => track.id)).toEqual(['song','bare']);
    expect(result.topTracks[0]).toMatchObject({duration_ms:210000,explicit:false,spotifyUrl:'https://open.spotify.com/track/song',
      external_urls:{spotify:'https://open.spotify.com/track/song'},albumCover:'https://images.example/album',
      album:{id:'album',name:'Album',images:[{url:'https://images.example/album'}]},artists:[{id:'lead',name:'Lead'},{id:'guest',name:'Guest'}]});
    expect(result.topTracks[1]).toMatchObject({albumCover:null,album:{images:[]},artists:[]});
    expect(result.topArtists).toEqual([
      {id:'lead',name:'Lead',external_urls:{spotify:'https://open.spotify.com/artist/lead'},images:[{url:'https://images.example/artist'}]},
      {id:'bare-artist',name:'Unpictured Artist',external_urls:{spotify:undefined},images:[]}
    ]);
  });

  it('retains stored genre percentages when a snapshot contains only part of the original ranking', async () => {
    const {service} = setup({snapshot_date:'2026-10-05',stats_snapshot_genres:[{rank:2,genre_name:'Dream Pop',weight:18},{rank:1,genre_name:'Rock',weight:24}]});
    const result = await service.loadLatestStatsSnapshot('owner','short_term',1);
    expect(result.topGenres).toEqual([{name:'Rock',count:24,percentage:24},{name:'Dream Pop',count:18,percentage:18}]);
  });

  it('converts older rank-weighted genre snapshots without changing genre order', async () => {
    const {service} = setup({snapshot_date:'2026-10-05',stats_snapshot_genres:[{rank:2,genre_name:'Dream Pop',weight:100},{rank:1,genre_name:'Rock',weight:200}]});
    const result = await service.loadLatestStatsSnapshot('owner','short_term',1);
    expect(result.topGenres).toEqual([{name:'Rock',count:200,percentage:67},{name:'Dream Pop',count:100,percentage:33}]);
  });

  it('returns no snapshot for a denied read and permits a later authorized retry', async () => {
    const errorLog=vi.spyOn(console,'error').mockImplementation(()=>{});
    try {
      const {service,query}=setup({snapshot_date:'2026-10-05'}, {code:'42501',message:'Permission denied'});
      await expect(service.loadLatestStatsSnapshot('owner','short_term',1)).resolves.toBeNull();
      query.maybeSingle.mockResolvedValueOnce({data:{snapshot_date:'2026-10-05'},error:null});
      expect((await service.loadLatestStatsSnapshot('owner','short_term',1)).snapshotDate).toBe('2026-10-05');
      query.maybeSingle.mockResolvedValueOnce({data:null,error:null});
      await expect(service.loadLatestStatsSnapshot('owner','short_term',1)).resolves.toBeNull();
    } finally {errorLog.mockRestore();}
  });
});
