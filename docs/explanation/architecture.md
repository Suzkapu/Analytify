# Architecture

The project is still being planned. These requirements describe the intended design.

## Local-first apps

- Provide native apps and a website/PWA. Core app features must work without Supabase or the smart-features backend.
- Each app calls the Spotify API and stores its data locally. Spotify receives the requests needed for its API.
- User data is not sent to an Analytify server unless the user chooses to use an optional service.
- Store local preferences, such as the theme, where appropriate. The storage approach for each platform is not chosen yet.
- The website needs to be delivered to the browser. PWA offline availability, caching, updates, and browser storage still need to be defined.

## Optional services

- **Supabase:** sync local data and history between devices when the user enables it.
- **Smart-features backend:** handle automatic stats requests, administration, and other server-only features. Check administrator authorization on the server.
- The website and backend may run on the same machine, but must be deployable and operable independently.
- Remote social features require the relevant online service. Decide which features depend on sync or the backend and which data and credentials they need.
