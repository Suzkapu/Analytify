# Spotify credential key rotation

Spotify refresh tokens use a versioned AES-256-GCM key ring. `SPOTIFY_TOKEN_ENCRYPTION_KEYS` is a JSON object whose keys are positive version numbers, and `SPOTIFY_TOKEN_ENCRYPTION_WRITE_VERSION` selects the only version used for new writes. The legacy `SPOTIFY_TOKEN_ENCRYPTION_KEY` remains the version-1 fallback during migration and rollback.

## Rotation procedure

1. Generate a new 32-byte base64 key and add it to `SPOTIFY_TOKEN_ENCRYPTION_KEYS` without removing any current key. Deploy the worker and Edge Functions with the old write version. This makes the new release able to read both versions before any new-version row exists.
2. Change `SPOTIFY_TOKEN_ENCRYPTION_WRITE_VERSION` to the new version and deploy again. Every new or refreshed credential now uses that version. The worker re-encrypts at most 25 older rows per startup; each row is decrypted, re-encrypted, decrypted again for verification, and then replaced with a compare-and-swap update.
3. Check that no credentials retain the previous version and inspect failures before retiring it:

   ```sql
   select key_version, count(*) from public.spotify_credentials group by key_version;
   select * from public.spotify_credential_rotation_audit
   where status = 'failed' order by completed_at desc limit 100;
   ```

   Restarting the worker safely resumes an interrupted batch.
4. Only after the old-version count is zero, remove its read key in a later deployment.

## Rollback

Keep the old and new read keys deployed throughout the observation window. To roll back application code, first deploy the prior release while its write key is still retained in the ring. If rows have already moved to the new version, do not remove that new read key; set the intended write version and allow the worker to migrate rows before retiring either key. Missing or corrupt key versions fail closed and are recorded without exposing token plaintext.
