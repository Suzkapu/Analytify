# Cancellation before route rendering

Additional baseline56761:20 account-boundary tests passed/one failed; the actual Router ActivationStart observer saw the old HTTP request still active at public-page activation. Canceling only in NavigationEnd allowed route stability/view-transition DOM updates to wait for the retired profile.

The shell now invalidates/cancels account retrieval during public/focus ActivationStart, after route guards and before rendering. NavigationEnd still owns route metadata, closing launchers and destination focus. Same-account app destinations preserve retrieval. No route guard or permission check changes.

Focused89877:78 tests/fourfiles pass. FullCI34334:1,144 frontend passed/one documented isolated-service integration skip,107workerCI,26Deno and all unchanged release/security/type/lint/build/budget checks. Fresh frontend inventory/coverage in shell-account-activation-coverage.json; all98gates still fail independently. Final native99884 observes native transition promises and checks the complete runner log; status in progress document. Earlier runner-green traces with console timeouts remain failures of clean motion verification.
