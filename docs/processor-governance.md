# Processor and international-transfer register

Last reviewed: 24 September 2026

This register distinguishes facts that can be verified from the repository from deployment facts that require operator-held contracts and provider-console evidence. A provider policy page is not a substitute for an executed Article 28 agreement, a selected production region, or a transfer-impact assessment. **No missing item below may be represented as verified until the operator records the dated evidence outside the public repository.** Contract copies, account identifiers, and security contacts must remain in the operator's restricted compliance folder, not in Git.

## Current register

| Service | Role and data | Repository-confirmed purpose | Agreement evidence | Production regions and backups | Transfer basis / assessment | Subprocessors | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Supabase | Intended processor for authentication, PostgreSQL data, Edge Functions, and related logs | Cloud identity, collaboration, encrypted credential storage, and scheduled-feature state | Operator must record the signed DPA version, parties, acceptance date, account/project, and renewal review date | Operator must export evidence of the database, Auth, Edge Function, log, and backup regions plus backup retention/deletion | Operator must record whether every location is EEA, adequacy-covered, or SCC-covered and complete a transfer-impact assessment where SCCs are used | Operator must retain the applicable dated subprocessor list and change-notification setting | **Not verified in this repository** |
| Oracle Cloud Infrastructure | Intended processor for the web server and background worker, including transient request and operational logs | Serve the application and run opt-in scheduled work | Operator must record the signed DPA version, parties, acceptance date, tenancy, and renewal review date | Operator must export the compute, boot-volume, log, snapshot, and backup regions and retention settings | Operator must document the applicable adequacy or SCC route and transfer-impact assessment | Operator must retain the applicable dated subprocessor list and notification setting | **Not verified in this repository** |
| Web Push provider selected by the user's browser | Role varies by browser/provider; receives endpoint and encrypted push payload | Deliver notifications explicitly enabled by the user | No provider is selected by Analytify; operator must document the role analysis for supported browser providers | Determined by the user's browser/provider | Operator must record the role and transfer analysis rather than assuming processor status | Determined by provider | **Role and transfer review pending** |
| Spotify | Separate service/controller for the user's Spotify account and Spotify API/CDN; not described as Analytify's processor | Authenticate Spotify and supply requested Spotify content | Governed by Spotify developer and end-user terms, not recorded here as an Article 28 processor agreement | Determined by Spotify | Users are informed that Spotify may process data under its own privacy framework | Determined by Spotify | **Separate-provider classification; counsel review pending** |

## Required evidence record

For each processor, the operator must keep one dated record containing:

1. legal provider entity, service/account identifier, executed DPA version and acceptance proof;
2. service, database, function, log, replica, snapshot, and backup regions;
3. backup retention and the provider's deletion/restore behaviour after an Analytify deletion;
4. current subprocessor list, notification subscription, and review date;
5. transfer mechanism for every non-EEA destination, including the adequacy decision or SCC module/version;
6. transfer-impact reasoning covering government access, encryption, credential access, and supplementary measures;
7. security-incident contact, notification deadline, cooperation/escalation owner, and breach-record location;
8. deletion/export contact, contractual response deadline, verification evidence, and exit procedure.

The Analytify operator owns contract acceptance, quarterly evidence review, incident coordination, data-subject request escalation, and deletion verification. Providers own the contractual security, incident-notification, assistance, return/deletion, audit, and subprocessor obligations stated in their executed agreements. The operator must test restoration and deletion procedures without copying production personal data into the repository.

## Release rule

Cloud processing must not be described as contractually verified while any relevant row above remains unverified. Before a production operator enables or materially changes a processor-backed feature, they must complete the evidence record, update the public Privacy Notice with the verified provider entity/regions/transfer route, and obtain qualified advice where role or transfer classification remains uncertain.
