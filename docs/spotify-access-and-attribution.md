# Spotify access, attribution, and reconnect policy

Last reviewed: 23 September 2026

Analytify is an unofficial Spotify Web API client. The login page explains the requested data before either hosted OAuth or personal-app PKCE begins. Spotify metadata and artwork must retain Spotify's supplied text and imagery, appear with the global **Powered by Spotify** attribution, and link to the applicable `open.spotify.com` object wherever Spotify supplies an object URL.

## Scope map

| Scope | Used for |
| --- | --- |
| `user-read-private` | Verify which Spotify profile is connected and apply its market. |
| `user-library-read` | Show Liked Songs and allow the user to select them for playlist tools. |
| `playlist-read-private` | Show and select the user's private playlists. |
| `playlist-read-collaborative` | Show collaborative playlists the user can access. |
| `user-top-read` | Show short-, medium-, and long-term top songs and artists and save opted-in snapshots. |
| `user-read-recently-played` | Show and optionally save listening history. |
| `playlist-modify-private` | Requested incrementally after a user first chooses a playlist-changing action; creates or updates only private playlist copies, Compare Room results, shared-playlist copies, and Song League playlists the user asks Analytify to maintain. |

Initial login does not request playlist-write access. If Spotify rejects a playlist-changing request because that scope is absent, Analytify starts a new authorization containing the existing read scopes plus `playlist-modify-private`; after returning, the user repeats the action. Analytify does not request public-playlist write access, playback control, email, followers, or social scopes. Temporary Compare Room participants use a separate PKCE authorization limited to profile, library/playlist selection, and private-playlist creation; that flow does not request top-item or listening-history access. Any newly introduced feature must add only its required scope and explain the new access before authorization.

## Refresh-token expiry

Spotify refresh tokens expire six months after authorization. A `400 invalid_grant` response is terminal: the browser clears its unusable access and refresh tokens, the worker deletes its encrypted and legacy refresh credential, no retry is scheduled, and automatic updates show **Reconnect needed** until the user completes Spotify authorization again. Transient network failures and `429`/server errors keep their bounded retry behavior and must not be mistaken for an expired grant.

## Development Mode limits

The hosted Spotify app is currently subject to Spotify's Development Mode rules. The app owner must have Spotify Premium. At most five authenticated Spotify users can use the app, and every hosted-app user must be added to its allowlist; a login can appear to work for a non-allowlisted user while later API calls return `403`. Users outside that allowlist must use their own Spotify Developer app and public Client ID. Extended quota access is not claimed.

Authoritative references:

- [Spotify Design and Branding Guidelines](https://developer.spotify.com/documentation/design)
- [Spotify refresh-token expiration announcement](https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration)
- [Spotify Web API quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
