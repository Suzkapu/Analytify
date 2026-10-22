# Design v2 execution loop

Process adjustment requested 11 October 2026. The original implementation plan,
release boundaries, retained feature scope and separate 98% coverage gates remain
the completion contract.

## Finish the selected workflow

The selected slice is Friends plus the dependent Navigation shortcut workflow.
Its next deliverable is a usable responsive Angular workflow, with canonical
loading/busy/error/recovery states, recipient-owned pending requests, independent
private-data permissions and meaningful service/component/browser verification.
Do not start unrelated UI redesign slices while these acceptance checks remain
open. Reconcile main's newer League semantics when the League slice resumes.

## Match checks to changes

Reusing infrastructure is not a restriction on new verification. Add new tests,
fixtures, harnesses or tools when they cover missing behavior or materially improve
reliability or speed. Prefer an existing capable tool, but replace or extend it when
it cannot prove the required contract. Do not substitute old test results for new
workflow verification.

- During implementation, run the relevant unit/component or native service
  contract and directly affected policy checks. Add characterization before
  changing behavior. Preserve failing evidence and fix the cause.
- Run full CI and fresh application coverage at completed feature boundaries,
  dependency/toolchain changes, or when a failure establishes a broader risk.
  Do not repeat unchanged passing checks as reassurance.
- Run the relevant cross-browser workflow and responsive/visual comparisons
  after mounting the slice. Diagnose one failing case before rerunning its
  whole matrix. Never weaken checks, quarantine tests or accept images blindly.
- Investigate infrastructure with the smallest real contract. Once proven,
  reuse it rather than building another harness for each test group. Missing
  hosted transport remains an explicit verification gap.

## Keep evidence useful

- Maintain a compact current-state summary and feature checklist in the progress
  document. Keep historical results as history; avoid restating the same totals
  at every intermediate step.
- Keep one final evidence manifest per feature/check category, linking command
  logs, source hashes and representative artifacts. Retain failures that explain
  fixes; do not add redundant passing captures or duplicate summaries.
- Report outcomes and remaining acceptance checks rather than tool activity.
  Batch independent reads/checks; keep dependent edits and tests sequential.
- Use local commits only when the user requests them. No automatic commit,
  deployment, main merge or shared-service/database change.

This reduces repeated work; it does not replace full-scope completion evidence.
