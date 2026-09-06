# Playlist synchronization authority

Shared-playlist source snapshots have one automatic publisher: the sync worker,
using fresh Spotify data and `refresh_playlist_share_from_worker`. Browser code
may publish only an explicit owner-requested refresh, and it must present the
revision that the owner viewed. Loading or caching a playlist never publishes it.

Existing recipient Spotify copies may be updated by either the worker (for a
stored credential) or the active recipient browser. The database is the
authority: a revision-bound lease grants exactly one executor permission to
mutate a destination. Completion advances only the exact claimed source/applied
pair, and database triggers prohibit revision regression.

Song League has one Spotify mutation implementation:
`song-league-playlist-sync`. The worker only schedules that Edge Function. A
database lease serializes each league, and a completion is accepted only while
the source revision, round, previous applied revision, and lease token all match.

Spotify replacement calls are idempotent for a fixed revision: they set metadata,
replace the first 100 tracks, and append deterministic subsequent chunks. If the
source changes during the side effect, completion is rejected and the newest
revision is retried without recording stale state.
