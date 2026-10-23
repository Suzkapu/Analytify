# Proposed isolated Friends HTTP verification job

Use a separate verify-only `ubuntu-24.04` job, preserving the existing preview verification runner, all release gates and deployment boundaries. The official runner manifest (image `20261012.334.1`) lists PostgreSQL16.15 preinstalled and its service disabled. The installer installs `postgresql-16` and `libpq-dev`. This helper uses only the version-specific binaries and native pgcrypto assets; it never starts that host service or installs packages.

Primary sources inspected 2026-10-23:
- https://raw.githubusercontent.com/actions/runner-images/main/images/ubuntu/Ubuntu2404-Readme.md
- https://raw.githubusercontent.com/actions/runner-images/main/images/ubuntu/scripts/build/install-postgresql.sh

After existing pinned checkout/Node setup and `npm ci`, the job steps should execute:

```bash
node --test scripts/provision-isolated-friends-runtime.test.mjs
node integration/friends-http/verify-isolation.mjs
mkdir -p docs/testing-evidence/design-v2/friends-http-ci-artifacts
node scripts/provision-isolated-friends-runtime.mjs \
  > docs/testing-evidence/design-v2/friends-http-ci-artifacts/runtime.json
ANALYTIFY_TEST_POSTGRES_ROOT="$(jq -er .postgresRoot docs/testing-evidence/design-v2/friends-http-ci-artifacts/runtime.json)" \
ANALYTIFY_TEST_POSTGREST_ROOT="$(jq -er .postgrestRoot docs/testing-evidence/design-v2/friends-http-ci-artifacts/runtime.json)" \
node scripts/test-isolated-friends-http-contract.mjs --angular-contract \
  > docs/testing-evidence/design-v2/friends-http-ci-artifacts/contract.log 2>&1
```

Run under the CI shell's normal fail-on-error behavior. A missing/corrupt archive, unsupported platform/Ubuntu version, missing/unsafe PostgreSQL installation, mismatched PostgreSQL versions or missing pgcrypto fails the job. No skip, fallback version, external database argument, production secret or service deployment is permitted. The job should become a required predecessor of preview deployment alongside existing verification.

Upload `docs/testing-evidence/design-v2/friends-http-ci-artifacts` on success/failure. The runtime JSON contains safe local executable roots, actual versions and prerequisite paths. The existing runner owns/cleans temporary databases, sockets and JWT signing material; its summary log records actual outcomes. The provisioned executable workspace is under the already ignored `.extra_files/isolated-friends-runtime/.ci-provision-*`, and the ephemeral CI job discards it. If caching is added, cache **only** `.extra_files/isolated-friends-runtime/postgrest.tar.xz`; extracted binaries and PostgreSQL symlinks must be rebuilt and checked each run.

Local evidence:13 focused provisioning boundary tests PASS/0skip, ESLint PASS; exact pinned PostgREST archive/binary SHA256 + extraction + actual `--version` PASS without network. PostgreSQL16 and the Ubuntu24.04 job were **not run** on this CachyOS host, which has only the previously tested PostgreSQL18.6 runtime. The first remote job must execute all12 existing HTTP outcome groups and6 Angular adapter tests before reporting CI integration successful. Selected SQL inspection found no17/18-only syntax; it does not substitute for executing those groups against16. This adds PostgreSQL16 evidence alongside historical18.6 results, not hosted Supabase/Auth/OAuth/Realtime/full-chain parity.

No existing runner, pipeline, production source, shared documentation or deployment was changed by this slice.
