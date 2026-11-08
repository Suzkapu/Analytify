# Server operations

The hosting setup is planned and has not been implemented yet.

- Use Caddy on a Linux server to serve the website/PWA over HTTPS and forward API requests to the optional Rust backend when it is enabled.
- Run the backend independently as a separate systemd service on a systemd-based server. The website and backend may share a machine but must be deployable and operable separately.
- Configure a domain, HTTPS, PWA caching and offline behavior, deployment, rollback, and monitoring when implementing hosting.
- Add logs, health checks, and a way to see failures in scheduled tasks. Monitoring tools are not chosen yet.
- Measure performance with the actual application and server. No performance target or benchmark has been established yet.
