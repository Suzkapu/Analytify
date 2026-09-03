# Analytify

![Analytify logo](src/assets/icons/icon-128x128.png)

**Discover what your Spotify library says about you.**

[Open Analytify](https://analytify.dynv6.net)

---

Analytify turns your Spotify library and listening data into a clear, visual overview. It helps you explore large playlists, understand your listening habits, and see how your favorite music changes over time.

## What you can do

### Explore playlists

- Browse your playlists, collaborative playlists, and Liked Songs.
- Search and sort songs, artists, albums, and playlists.
- See which artists appear most often in a playlist.
- Group playlist songs by album and open music directly in Spotify.
- View every song by a selected artist within the current playlist.

### Compare together

- Host a temporary desktop Compare Room without replacing your main Analytify login.
- Invite other Spotify accounts with participant-specific QR codes or short links.
- Select one playlist or Liked Songs per participant and find the exact tracks everyone has.
- Review and approve the shared result before creating a private copy on every participant's Spotify account.
- Keep guest Spotify credentials in memory only; room messages never contain access or refresh tokens.

### Play Song League

- Open its separate lazy-loaded module from the dedicated header Workspace launcher, beside Compare and Private Sharing.
- Create a private league for three to five friends and invite normal Analytify accounts.
- Recommend one discovery during each Friday submission window.
- Create your own private Weekly Picks playlist from the league; once enabled, accepted picks refresh it automatically.
- Start each Friday with only that week's recommendations—the unattended rollover updates enabled playlists and removes the prior week's songs without interrupting their four-week scores.
- Earn permanent points for four weeks from the song's daily position in every other member's four-week Top Songs.
- Inspect the current rank and point contribution from every friend without exposing anyone's complete Top Songs list.
- Let the league owner permanently delete the league and its game history through an explicit confirmation dialog.
- Opt into PWA push reminders when Friday picks open, then disable them in Song League or the shared notification manager.

### Analyze your music

- See the total and average duration of a playlist.
- Find its oldest, newest, shortest, and longest songs.
- Discover your top 100 tracks, top artists, and top genres.
- Switch between your recent, medium-term, and long-term listening habits.
- Create a Spotify playlist from your current top tracks.
- Keep every playlist created by Analytify private by default.

### Follow changes over time

- Keep daily snapshots of your personal Spotify statistics.
- Compare different days and identify new, rising, or falling tracks and artists.
- Open trend charts to follow rank changes over time.
- Review your recently played songs and listening history.

### Keep control of your data

Analytify stores data locally in your browser so previously loaded views remain quickly available. Optional Cloud Backup keeps your history and snapshots available across sessions and enables automated daily collection. You can delete either the local cache or your personal cloud data from the profile menu. Song League requires Cloud Backup because its trusted daily snapshots are the source of every score.

Users who are not allowlisted on Analytify's hosted Spotify app can choose **Use your own Spotify app** on the login page. They paste only their public Client ID and authorize with PKCE; no Client Secret, email, phone number, or Analytify registration is required. Core library and statistics features remain local until the user explicitly enables a cloud feature.

## Development

```bash
npm ci
npm start
```

The Compare Room's direct Spotify PKCE flow requires both callback URLs to be registered in the Spotify developer dashboard:

```text
http://127.0.0.1:4200/compare-room/callback
https://analytify.dynv6.net/compare-room/callback
```

The existing `/callback` URLs remain required for the normal Supabase-backed login.

Personal Spotify apps must register Analytify's dedicated callback exactly:

```text
http://127.0.0.1:4200/spotify/callback
https://analytify.dynv6.net/spotify/callback
```

Each personal app uses Authorization Code with PKCE. When creating it, select Web API. Spotify currently requires the app owner to have Premium and limits a Development Mode app to five allowlisted Spotify users. Analytify uses Spotify's stable `account_id` for new local profiles when available, while existing profiles retain their established cache key.

Shared Playlist claim links expire after seven days when unclaimed. Revocation removes the stored track snapshot and recipient download mapping immediately; a daily Supabase Cron job deletes expired unclaimed shares and 30-day revoked tombstones. Apply the migrations with `supabase db push` so the database-enforced retention policy and scheduled cleanup are active.

Song League playlist creation requires the database migrations, the authenticated Edge Function, and its Spotify credentials:

```bash
supabase db push
supabase secrets set SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... SPOTIFY_TOKEN_ENCRYPTION_KEY=... WEB_PUSH_VAPID_PUBLIC_KEY=... WEB_PUSH_VAPID_PRIVATE_KEY=...
supabase functions deploy spotify-credentials
supabase functions deploy song-league-playlist-sync
supabase functions deploy song-league-notifications
```

Enable **Anonymous Sign-Ins** in Supabase Authentication before personal-app users can opt into Cloud Backup or server-backed Workspace features. Anonymous identities contain no email or phone and are deleted when their browser-bound Analytify session is cleared.

The configurable sync service replaces the former `scripts/daily-pull.js`. Its independent tasks cover listening history, each Spotify stats range, Shared Playlist sources and copies, and Song League playlist rollover. Administrators configure schedules and enqueue manual runs from `/admin`; the worker uses the same queue for scheduled and manual work.

Create protected GitHub Actions secrets named `ADMIN_SPOTIFY_IDS`, `SPOTIFY_TOKEN_ENCRYPTION_KEY`, `SPOTIFY_CLIENT_SECRET`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, and `WEB_PUSH_VAPID_PRIVATE_KEY`. The encryption key must be a stable base64-encoded 32-byte key, which can be generated once with `openssl rand -base64 32`; losing or rotating it without a migration makes stored refresh tokens unreadable. Generate a P-256 VAPID key pair once for PWA push delivery, keep its 43-character base64url private scalar in `WEB_PUSH_VAPID_PRIVATE_KEY`, and publish the matching uncompressed public key in the application environment. Deployment applies pending Supabase migrations, synchronizes the Spotify, encryption, and Web Push secrets, publishes the Edge Functions, writes protected worker configuration, and only succeeds after live Oracle and Supabase smoke checks pass.

```bash
cd services/sync-service
npm install --omit=dev
npm start                 # long-running worker
# or: npm run once        # one scheduler pass, useful from cron
```

The deployment workflow applies `20260815120000_admin_control_plane.sql`, `20260816090000_personal_spotify_guest_access.sql`, and later pending migrations before publishing the application. At startup the worker encrypts existing hosted-app tokens and erases them from the deprecated column; first-use migration remains as a safe fallback. Enable Anonymous Sign-Ins once in the Supabase Authentication settings for personal-app users who opt into cloud features. See [the sync-service guide](services/sync-service/README.md) for the rollout order.

Run the complete compile and production-build verification before committing:

```bash
npm run verify
```

Run the same headless unit-test gate used by GitHub Actions when Chrome is available:

```bash
npm run verify:ci
```

GitHub Actions additionally starts an isolated Supabase/PostgREST stack and runs `npm run test:supabase-integration`. That CI-only integration begins with empty IndexedDB, restores seeded playlist and current-stat data through the real `SupabaseService` and `StorageService`, renders the real Angular components, and fails if the mocked Spotify HTTP boundary receives a request. It uses no production database, Spotify token, or Spotify client secret and is intentionally not part of the ordinary local verification command.

Every push runs this gate and, after it succeeds, deploys that branch to the shared live server. Pull-request-only events remain verification/preview builds and never receive deployment credentials. A manually dispatched workflow can also deploy its selected branch.

The application uses lazy-loaded vertical feature slices, shared layout/UI modules, and a root-only core infrastructure layer. See [Architecture](docs/architecture.md) for the directory map, dependency rules, and instructions for adding a page or service.


## License

Analytify is licensed under the [GNU Affero General Public License v3.0](LICENSE).

Spotify is a trademark of Spotify AB. Analytify is an independent project and is not affiliated with or endorsed by Spotify.
