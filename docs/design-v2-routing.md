# Canonical product routing

Design v2 is the only Analytify presentation. Normal non-prefixed URLs such as `/playlists`, `/stats`, `/history`, `/song-league`, `/shared-playlists`, and `/compare-room` mount one persistent product shell.

## Route registry

`resolveDesignRoute` is the single logical registry for login, Spotify setup, Library, Insights, administration, Song League, Private Sharing, Compare Room, and Legal destinations. Feature code uses `DesignNavigationService` rather than inspecting the current URL. Durable room, invite, share, league, and Spotify identifiers are passed through unchanged; query parameters remain Angular `NavigationExtras`.

There is no runtime design variant, feature flag, or legacy/v2 presentation branch. `/new/*` is accepted only by the first top-level compatibility matcher. It redirects the complete remaining path to the canonical URL while preserving query parameters and fragments. `newness` and other similarly named paths do not match.

## Authentication and external links

Protected-route guards store the complete attempted URL. Hosted OAuth and personal-app PKCE consume the validated return URL, so canonical links remain canonical and old `/new/*` bookmarks pass through the compatibility redirect. Share, invite, claim, and Compare Room links keep the same tokens and route shapes.

## Persistent shell

The lazy product routing module mounts one `DesignV2ShellComponent` above every page. Child navigation replaces only its router outlet, preserving desktop navigation, mobile navigation, ambient renderer, and overlay host. The shell owns the single main landmark and skip link and restores focus after an in-shell route change.

Desktop and mobile navigation project the same `DESIGN_V2_NAVIGATION` model. Each user-facing route supplies a document title plus semantic `pageId`, `mobileTitle`, `pageWidth`, and `ambientKey` metadata. Only Playlists, Stats, and History opt into selective preloading.

## Compatibility retirement

Keep the `/new/*` matcher for bookmarked and externally shared migration-era URLs until server access logs show it is no longer needed. Removing it is then one routing-layer deletion; feature components and durable identifiers require no edits.

The ambient renderer and native-transition rules are documented in [Design v2 ambient background](design-v2-ambient-background.md). Release activation and visual rollback are documented in [Design v2 rollout](design-v2-rollout.md).
