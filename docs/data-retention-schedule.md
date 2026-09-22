# Data retention schedule

Analytify keeps data only while it has a stated product, safety, or operational purpose. The machine-readable source of truth is [`config/data-retention-inventory.json`](../config/data-retention-inventory.json). CI compares that inventory with every database table, so a schema change cannot silently add data without a lifecycle decision.

## Safe deletion boundary

- Listening history, stats history, approved stats access, active playlist shares, blocks, and league history are **not** removed merely because they are old or an account appears inactive.
- An account with no synchronization activity for 730 days is reported only as an operator review candidate. It is never auto-deleted.
- Nightly cleanup removes expired technical state, collaboration tombstones after their documented grace period, resolved moderation reports and their audit events after 180 days, and Spotify catalog rows only when no history, snapshot, ranking, or league record references them.
- Pending abuse reports remain until reviewed. Blocks remain until the blocker removes them or the account is deleted.
- Closed leagues remain until their owner explicitly deletes them, preserving historical results.

## Erasure and backups

User-facing delete controls remove live data and database cascades remove dependent records. Analytify does not expose deleted live rows from backups. Infrastructure backups are encrypted, retained for no more than 30 days, and used only for disaster recovery—not to restore an individual deleted record. If a disaster restore occurs, deletion and revocation records must be reapplied before the service returns to normal access.

No separate application-level user-data backup is created by this repository. The operator must verify provider backup retention and regional settings during each quarterly review.

## Operation and monitoring

`private.run_data_retention_cleanup()` runs nightly and writes aggregate counts to `retention_cleanup_runs`; it does not copy deleted content into the log. The sync worker calls `monitor_data_retention_health()`. A failed cleanup, or no successful cleanup within 48 hours, creates a critical operational alert subject to the standard alert cooldown.

The policy and implementation are reviewed at least every 90 days and whenever a table, cache, log, provider, or product feature is introduced.
