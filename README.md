# Analytify

![Analytify logo](src/assets/icons/icon-128x128.png)

Analytify is a personal Spotify library and statistics viewer. It helps you browse large playlists, see your current top music, follow daily ranking changes, and use a few private tools with friends.

[Open Analytify](https://analytify.dynv6.net)

## Main features

- **Playlist explorer:** search and sort playlists, songs, artists, and albums; merge playlists; and open tracks in Spotify.
- **Playlist summaries:** see song, artist, album, duration, and explicit-track counts plus top artists and albums.
- **Listening statistics:** view your top 100 songs, artists, and genres for Spotify's 4-week, 6-month, and 1-year ranges.
- **Daily history:** compare saved snapshots and follow the position history of current or former rankings.
- **Listening history:** review recently played music when history collection is enabled.
- **Private sharing:** share a revocable playlist snapshot or ask a specific person for read-only access to their saved statistics.
- **Compare Room:** invite friends to a temporary room, select a playlist for each person, and find common or unique tracks. Guest Spotify logins are kept in memory only.
- **Song League:** join a private group, recommend a song during the Friday window, and follow its score in other members' short-term Top Songs.

## Your data

Previously loaded music is cached in your browser so the app can reopen it quickly. Cloud Backup is optional for ordinary playlist and statistics viewing. Features that need shared or scheduled data explain what they require before enabling it.

You can clear the local cache or delete your cloud data from **Data & account**. Playlist and statistics access can be revoked from **Private sharing**. Analytify never asks for a Spotify Client Secret.

If your Spotify account is not allowed on Analytify's hosted Spotify app, choose **Use your own Spotify app**. This uses your public Client ID with Spotify's PKCE login. The session stays local unless you choose a cloud-backed feature.

## Contributing and running locally

Setup, testing, architecture, Supabase, worker, and deployment instructions are in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Analytify is licensed under the [GNU Affero General Public License v3.0](LICENSE).

Spotify is a trademark of Spotify AB. Analytify is an independent project and is not affiliated with or endorsed by Spotify.
