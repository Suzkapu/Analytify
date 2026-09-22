# Repository security controls

Last verified: 2026-09-22 through the GitHub repository API.

## Enabled controls

- GitHub secret scanning
- secret-scanning push protection
- Dependabot vulnerability alerts
- Dependabot automatic security updates
- CodeQL analysis on pull requests and `main`
- dependency review on pull requests
- weekly npm advisory checks and CycloneDX SBOM generation
- private vulnerability reporting through the route in `SECURITY.md`

The API reported no open CodeQL, secret-scanning, or Dependabot alerts at the time
of verification.

## Account-level availability

GitHub continued to report `secret_scanning_non_provider_patterns` and
`secret_scanning_validity_checks` as disabled after an authenticated request to
enable every `security_and_analysis` control. These options are therefore treated
as unavailable for the current public-repository/account configuration, not as
active protections. Recheck them when the repository plan or GitHub availability
changes.

## Handling findings

Automated findings and private reports follow the response, remediation, and
false-positive rules in `SECURITY.md`. Repository settings are evidence of enabled
controls; they do not replace triage or live verification of a remediation.
