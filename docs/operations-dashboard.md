# Operations dashboard runbook

The private Admin page separately shows sync and push-delivery queue depth and oldest age, expired leases, active deduplicated alerts, and whether all five recorded component releases agree. The worker evaluates health every pass. An alert is emitted immediately, then at most once every 30 minutes while it remains active; recovery resolves it automatically.

## Action thresholds

- **Sync backlog:** 50 queued jobs or an oldest age of 15 minutes. At one hour it is critical. Check worker health and Spotify/Supabase availability before adding capacity.
- **Push backlog:** 100 queued or retrying deliveries or an oldest age of 15 minutes. At one hour it is critical. Check worker health and the push provider before retrying manually.
- **Expired leases:** any expired running lease is critical. Confirm the worker restarted, then allow the atomic claim function to recover the job; do not edit running rows manually.
- **Push provider errors:** at least 10 completed deliveries in one hour and 20% failures. At 50% it is critical. Check provider response classes and VAPID configuration without exposing endpoints or keys.
- **Release mismatch:** frontend `version.json`, database/Edge entries in `deployment_revisions`, Edge response headers, and worker health must report the intended commit. Stop further production mutation and redeploy the same verified commit.

Completed successful/cancelled jobs and sent deliveries are retained for 30 days. Failed run and delivery errors are redacted at 30 days and their records are removed at 90 days. Credential rotation audit entries are removed after 90 days. The daily cleanup function returns deletion/redaction counts and can be invoked with the service role using `select private.cleanup_operational_history();`.
