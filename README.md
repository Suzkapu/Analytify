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

### Analyze your music

- See the total and average duration of a playlist.
- Find its oldest, newest, shortest, and longest songs.
- Discover your top 100 tracks, top artists, and top genres.
- Switch between your recent, medium-term, and long-term listening habits.
- Create a Spotify playlist from your current top tracks.

### Follow changes over time

- Keep daily snapshots of your personal Spotify statistics.
- Compare different days and identify new, rising, or falling tracks and artists.
- Open trend charts to follow rank changes over time.
- Review your recently played songs and listening history.

### Keep control of your data

Analytify stores data locally in your browser so previously loaded views remain quickly available. Optional Cloud Backup keeps your history and snapshots available across sessions and enables automated daily collection. You can delete either the local cache or your personal cloud data from the profile menu.

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

Run the complete compile and production-build verification before committing:

```bash
npm run verify
```

Run the same headless unit-test gate used by GitHub Actions when Chrome is available:

```bash
npm run verify:ci
```

Every push runs this gate. Deployment steps run only for a successful `main` push or a manually dispatched workflow.

The application uses lazy-loaded vertical feature slices, shared layout/UI modules, and a root-only core infrastructure layer. See [Architecture](docs/architecture.md) for the directory map, dependency rules, and instructions for adding a page or service.


## License

Analytify is licensed under the [GNU Affero General Public License v3.0](LICENSE).

Spotify is a trademark of Spotify AB. Analytify is an independent project and is not affiliated with or endorsed by Spotify.
