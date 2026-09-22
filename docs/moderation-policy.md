# User-report handling

Analytify's application operator is the responsible reviewer for user reports. Reports arrive in the protected Admin report inbox; ordinary users cannot read the inbox, the other person's identity, or the decision audit trail.

## Service target and case states

- A receipt is issued immediately with a stable `AR-…` reference.
- New reports are triaged within seven calendar days. Credible threats to safety, account compromise, or clearly illegal content are prioritized within 24 hours.
- Cases move through `submitted`, `under_review`, `resolved_action` or `resolved_no_action`. An affected person can move a resolved case to `appealed` once, within 30 days.
- Outcomes are warning, access revoked, no violation, or outside scope. The reviewer must record a reason and separate user-safe notices for the reporter and affected person. The inbox never claims to restrict an account when no such action was performed.
- Every submission, review start, decision, and appeal is appended to the audit history. It is not editable from the client.

## Notice, appeal, and retention

The reporter can see the receipt, status, and their notice. The affected person sees only an appropriate decision reason and notice, never the reporter's identity or report text. They can send an appeal from the same page for 30 days after a decision.

Pending and appealed reports remain until reviewed. Resolved reports and their audit events are deleted together after 180 days by the nightly retention job. Blocks remain separate and are controlled by the user.

## Illegal-content notices

The data model supports a separate `illegal_content` category and an HTTPS content reference. Whether Analytify is required to operate the full Digital Services Act Article 16 notice-and-action mechanism depends on the service's legal classification and must be confirmed by qualified EU counsel before that path is presented as a statutory mechanism. Until then, the operator must not describe an ordinary safety report as a legally compliant Article 16 notice.
