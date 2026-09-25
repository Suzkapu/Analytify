# Design v2 routing architecture

Design v2 is developed under a temporary `/new` route namespace while the existing presentation remains available. The namespace is owned only by the routing and navigation layer.

## Variant context

`DESIGN_VARIANT` supplies either `legacy` or `new`. The application root provides the legacy default; the `/new` parent route overrides it for its complete child tree. Components use `DesignNavigationService` and logical destination names instead of inspecting the current URL or writing `/new` paths.

`resolveDesignRoute` is the single registry for login, Spotify setup, library, insights, administration, Song League, Private Sharing, Compare Room, and Legal destinations. It resolves path parameters without changing durable room, invite, share, or league identifiers. Query parameters stay in Angular `NavigationExtras` and therefore are not mixed into the registry.

## Authentication returns

Protected-route guards store the complete attempted URL, including its design namespace and query string. Login records a variant-aware default before OAuth starts. The shared hosted callback consumes that stored URL, while personal-app PKCE stores its validated return URL inside the one-time authorization request. A login begun under `/new` therefore returns to `/new`; a legacy login remains on canonical legacy routes.

## Migration and removal

Feature and data services are shared. During migration, both route trees lazy-load the same feature modules under different shells. Pages gain v2 presentation through the injected variant and shared presentation primitives, not through cloned Spotify or Supabase services.

At cutover, canonical routes can receive the v2 shell and the temporary `/new` tree can become compatibility redirects. Removing `/new` then requires changes only in route configuration and `resolveDesignRoute`; feature components and durable external identifiers remain unchanged.

## Persistent shell and route context

The lazy `DesignV2RoutingModule` mounts one `DesignV2ShellComponent` above every v2 page. Child navigation replaces only the router outlet, so the desktop navigation, mobile header and bottom navigation, ambient host, and overlay host retain their state. The shell owns the single main landmark and skip link and moves focus to that landmark after an in-shell route change.

Desktop and mobile navigation are projections of `DESIGN_V2_NAVIGATION`; neither template owns a second route list. Each user-facing v2 route supplies a document title plus semantic `pageId`, `mobileTitle`, `pageWidth`, and `ambientKey` metadata. Coordinates and decorative values stay in scoped shell styles. Only Playlists, Stats, and History opt into `DesignSelectivePreloadingStrategy`, so adding the v2 namespace does not preload the complete feature tree.
