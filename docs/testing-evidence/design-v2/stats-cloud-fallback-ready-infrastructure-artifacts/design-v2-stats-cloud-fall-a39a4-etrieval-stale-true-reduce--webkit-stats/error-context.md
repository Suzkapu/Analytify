# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-cloud-fallback.spec.ts >> cloud-restored Stats cache preserves rankings and uses only necessary retrieval, stale=true (reduce)
- Location: e2e/design-v2-stats-cloud-fallback.spec.ts:6:7

# Error details

```
Error: browserType.launch: Target page, context or browser has been closed
Browser logs:

<launching> /home/suzkapu/.cache/ms-playwright/webkit-2359/pw_run.sh --inspector-pipe --headless --no-startup-window
<launched> pid=36134
[pid=36134][err] /home/suzkapu/.cache/ms-playwright/webkit-2359/minibrowser-wpe/bin/MiniBrowser: error while loading shared libraries: libicudata.so.74: cannot open shared object file: No such file or directory
Call log:
  - <launching> /home/suzkapu/.cache/ms-playwright/webkit-2359/pw_run.sh --inspector-pipe --headless --no-startup-window
  - <launched> pid=36134
  - [pid=36134][err] /home/suzkapu/.cache/ms-playwright/webkit-2359/minibrowser-wpe/bin/MiniBrowser: error while loading shared libraries: libicudata.so.74: cannot open shared object file: No such file or directory
  - [pid=36134] <gracefully close start>
  - [pid=36134] <kill>
  - [pid=36134] <will force kill>
  - [pid=36134] exception while trying to kill process: Error: kill ESRCH
  - [pid=36134] <process did exit: exitCode=127, signal=null>
  - [pid=36134] starting temporary directories cleanup
  - [pid=36134] finished temporary directories cleanup
  - [pid=36134] <gracefully close end>

```