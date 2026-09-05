# Database backup, rebuild, and recovery

The checked-in migration chain is the source of truth for schema recovery. A clean
rebuild is rehearsed in CI with `supabase db reset` followed by the pgTAP schema and
RLS suite.

## Back up

Before a production migration, create a provider point-in-time recovery marker and
export the `public` schema plus data with the pinned Supabase CLI. Store exports in
encrypted, access-controlled storage and record the application commit SHA and the
last migration version beside them. Never commit an export or credential.

## Restore into an isolated project

1. Create an empty Supabase project with the same PostgreSQL major version.
2. Apply `supabase/migrations` from the repository commit recorded with the backup.
3. Restore data with constraints and triggers enabled; do not use service-role keys
   in browser-accessible tooling.
4. Run `supabase test db` and compare the migration list with production.
5. Point a staging build at the isolated project and exercise login, backup restore,
   playlist sharing, Stats access, and Song League before switching traffic.

## Production recovery

Prefer a forward, backward-compatible repair migration. For destructive corruption,
stop writers, restore the provider snapshot into a new project, perform the isolated
validation above, rotate all service credentials, and switch the application only
after both schema and data checks pass. Keep the former project read-only until the
new deployment has been verified.
