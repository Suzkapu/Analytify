# Security policy

## Reporting a vulnerability

Please do not open a public issue for a suspected security vulnerability.

Use [GitHub's private vulnerability reporting](https://github.com/Suzkapu/Analytify/security/advisories/new) when available, or email `analytify.taking893@aleeas.com`. Include the affected page or component, reproduction steps, expected impact, and any proof of concept that is safe to share.

Do not access other users' data, disrupt the production service, or run destructive tests. We will acknowledge a report within seven calendar days and aim to provide an initial assessment within fourteen calendar days.

## Response and remediation

Reports are triaged by exploitability, affected data, affected users, and whether the issue is already being abused. The response targets are:

- critical: begin containment immediately and target containment within 72 hours;
- high: target a tested remediation within 14 days;
- medium: target a tested remediation within 60 days;
- low: schedule with normal maintenance and document the decision.

Third-party outages, coordinated disclosure, or a fix controlled by an upstream provider can extend those targets. When that happens, the private report records the owner, interim mitigation, next review date, and dependency on the provider.

Remediation follows the same lifecycle for private reports and automated alerts: validate the finding, contain exposure, revoke or rotate affected credentials, add a regression check when practical, deploy through the protected production workflow, verify the live revision, and coordinate disclosure. Material incidents also receive a short post-incident record with follow-up actions.

## False positives and accepted risk

An alert is dismissed only after its exact code path, package version, or detected secret has been reviewed. The dismissal must use the narrowest applicable GitHub reason and include evidence, an owner, and a review or expiry date. Secret alerts are not treated as harmless until the value is confirmed non-sensitive or the real credential has been revoked and replaced. A dismissal is reopened when the affected code, dependency, reachability, or evidence changes.

## Supported version

Only the version currently deployed from the `main` branch receives security fixes. Older commits and private forks are not supported releases.

## Disclosure

Please allow time for a fix and deployment before publishing details. We will coordinate disclosure with the reporter and credit them if requested.
