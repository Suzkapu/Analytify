# Runtime hardening

Analytify applies confinement at both the browser and background-worker boundaries. The deployment pipeline verifies these controls on every release instead of relying on a one-time server configuration.

## Background worker

The `analytify-sync.service` unit runs as an unprivileged account with a read-only system, a private temporary directory and device namespace, hidden process information, no Linux capabilities, no privilege escalation, and kernel, clock, hostname, control-group, realtime, SUID/SGID, IPC, personality, architecture, and address-family restrictions. Its only writable path is `/var/lib/analytify-sync`, and new files default to owner-only permissions through `UMask=0077`.

After the deployed worker answers its commit-aware health check, activation runs:

```sh
systemd-analyze security --no-pager analytify-sync.service
```

This verifies that the installed unit parses on the real host and records systemd's current exposure assessment in the deployment log. Worker health is checked before the audit so a valid-looking sandbox cannot hide a broken runtime.

Three tempting restrictions are deliberately omitted:

- `PrivateNetwork=true` would block required outbound Spotify and Supabase HTTPS traffic and the local health endpoint.
- `MemoryDenyWriteExecute=true` is incompatible with the V8 JIT used by Node.js.
- A broad `SystemCallFilter` is not enabled without a production syscall trace because Node.js and libuv use platform-dependent calls. The tighter capability, namespace, filesystem, and address-family controls remain enforced.

## Browser isolation

Responses use `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Resource-Policy: same-origin`, in addition to CSP, HSTS, frame denial, MIME sniffing protection, referrer policy, and permissions policy. Unit tests validate the versioned Nginx snippet, and deployment verification checks the live response.

`Cross-Origin-Embedder-Policy` is deliberately not enabled. Analytify displays Spotify and configured profile artwork from third-party origins that do not consistently return compatible CORS or CORP headers; COEP would turn valid artwork into blocked resources.

The CSP still permits inline styles because Angular currently injects compiled component styles at runtime. Scripts do not permit inline execution. Removing `style-src 'unsafe-inline'` requires a build-level nonce/hash or extracted-style migration and must be tested across lazy-loaded routes before enforcement.
