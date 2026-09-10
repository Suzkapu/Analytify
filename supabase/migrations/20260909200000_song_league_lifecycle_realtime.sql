do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'song_league_members'
    ) then
      alter publication supabase_realtime add table public.song_league_members;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'song_leagues'
    ) then
      alter publication supabase_realtime add table public.song_leagues;
    end if;
  end if;
end;
$$;
