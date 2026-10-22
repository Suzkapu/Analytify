# Isolated Angular Friends HTTP contract

This dedicated suite injects the actual `FriendsService` and `SessionLifecycleService`, uses actual supabase-js cached **synthetic** sessions, and sends real HTTP requests through PostgREST to a disposable PostgreSQL database. The narrow Spotify identity adapter and selected database/Auth prerequisites are fixtures. No production application, database schema or shared backend is changed.

From the repository root, with the pinned compatible runtimes available in the ignored cache:

```bash
ANALYTIFY_TEST_POSTGRES_ROOT="$PWD/.extra_files/isolated-friends-runtime/postgres" \
ANALYTIFY_TEST_POSTGREST_ROOT="$PWD/.extra_files/isolated-friends-runtime/postgrest" \
node scripts/test-isolated-friends-http-contract.mjs --angular-contract
```

The runner executes its existing 12 HTTP outcome groups, seeds three separate Angular actors, and invokes this suite before cleaning up its gateway, PostgREST process and database/socket/config workspace. Runtime archives/binaries remain in the ignored cache; live databases and signing material are temporary. Original pin/checksum provenance is in `docs/testing-evidence/design-v2/friends-http-runtime.json`; the new run manifest records cache verification and current source hashes.

The six adapter tests cover cached-session readiness, invitation DTOs and recipient permissions, single-use acceptance, versioned removal/reconnection, revoke/decline retries, the explicit backend capability gate, cancellation before client readiness, and a delayed real HTTP result from the previous actor followed by recovery through the next cached session. Actual independent Stats/playlist grant rows are compared byte-for-byte around the suite using the runner's existing fixture connection; authenticated raw-table privileges are not expanded.

A nonce challenge verifies that the loopback address belongs to this runner before any business request. Run the negative isolation check with:

```bash
node integration/friends-http/verify-isolation.mjs
```

It rejects external database arguments and supplies a deliberately wrong local fixture. Only the safe fixture metadata request may occur; business RPCs must remain zero.

This suite is outside `src` and therefore outside normal frontend test discovery. It has its own TypeScript configuration and is explicitly included by the runner; running it without the runner context fails, rather than skipping tests. No production source is excluded from application coverage, and these integration results are not added to coverage percentages.

This verifies selected Angular adapter/SDK/HTTP/database composition. It does not verify hosted Auth issuance/refresh/logout, Spotify OAuth, Realtime, the full migration chain, production deployment compatibility or browser/UI parity. The existing hosted integration limitation remains separate. CI runtime provisioning and registration remain to be completed.
