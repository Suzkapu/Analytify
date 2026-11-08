# Tech stack

Every addition or change to the tech stack needs explicit developer approval.

## Application

- **Rust:** all production application code is written in Rust. Testing tools and test code may use other languages.
- **Dioxus:** shared interface for web, desktop, and mobile. Platform integration and mobile behavior still need testing.
- **RSX and CSS:** write interface structure in Rust using RSX and use CSS for styling. The web build may generate or use HTML and other required web assets.
- **Charts:** use a Rust-compatible chart or drawing solution. The library is not chosen yet.
- **QR codes:** use QR code generation if the sharing or login flows need it. The use case and library are not chosen yet.

## Data and background work

- **Spotify API:** use a Rust HTTP client for Spotify data. Support OAuth login, token refresh, and secure token handling. The client and platform-specific flows are not chosen yet.
- **Supabase:** optional service for authentication and syncing data between devices. Core local use must not require Supabase. The Rust integration approach is not chosen yet.
- **Supabase Realtime:** use it if live updates are needed for social features or administration. The features that need it are not decided yet.
- **Tokio:** use it for background work and timers in the optional backend. Use `tokio-cron-scheduler` if calendar-style schedules are needed.

## Infrastructure and testing

- **Caddy:** serve the website over HTTPS and forward requests to the optional backend when it is enabled. Caddy is infrastructure, not Analytify application code.
- **systemd:** run the backend as a separate service on a systemd-based server.
- **GitHub Actions:** run tests and build public-project releases.
- **Testing:** use `cargo test` and `dioxus-test` for some GUI tests. The browser automation and accessibility testing tools are not chosen yet.

Notification providers and libraries still need to be evaluated. No specific chart, QR code, HTTP client, or storage library has been selected.
