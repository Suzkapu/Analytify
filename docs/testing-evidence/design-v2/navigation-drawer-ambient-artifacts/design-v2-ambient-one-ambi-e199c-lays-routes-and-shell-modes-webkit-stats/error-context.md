# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-ambient.spec.ts >> one ambient renderer persists through overlays, routes, and shell modes
- Location: e2e/design-v2-ambient.spec.ts:5:5

# Error details

```
Error: browserType.launch: Target page, context or browser has been closed
Browser logs:

<launching> /home/suzkapu/.cache/ms-playwright/webkit-2359/pw_run.sh --inspector-pipe --headless --no-startup-window
<launched> pid=116826
[pid=116826][err] /home/suzkapu/.cache/ms-playwright/webkit-2359/minibrowser-wpe/bin/MiniBrowser: error while loading shared libraries: libicudata.so.74: cannot open shared object file: No such file or directory
Call log:
  - <launching> /home/suzkapu/.cache/ms-playwright/webkit-2359/pw_run.sh --inspector-pipe --headless --no-startup-window
  - <launched> pid=116826
  - [pid=116826][err] /home/suzkapu/.cache/ms-playwright/webkit-2359/minibrowser-wpe/bin/MiniBrowser: error while loading shared libraries: libicudata.so.74: cannot open shared object file: No such file or directory
  - [pid=116826] <gracefully close start>
  - [pid=116826] <kill>
  - [pid=116826] <will force kill>
  - [pid=116826] exception while trying to kill process: Error: kill ESRCH
  - [pid=116826] <process did exit: exitCode=127, signal=null>
  - [pid=116826] starting temporary directories cleanup
  - [pid=116826] finished temporary directories cleanup
  - [pid=116826] <gracefully close end>

```