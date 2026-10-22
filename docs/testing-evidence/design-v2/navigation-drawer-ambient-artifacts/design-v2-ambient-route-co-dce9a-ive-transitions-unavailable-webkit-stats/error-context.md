# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-ambient.spec.ts >> route content and focus survive with native transitions unavailable
- Location: e2e/design-v2-ambient.spec.ts:73:7

# Error details

```
Error: browserType.launch: Target page, context or browser has been closed
Browser logs:

<launching> /home/suzkapu/.cache/ms-playwright/webkit-2359/pw_run.sh --inspector-pipe --headless --no-startup-window
<launched> pid=116917
[pid=116917][err] /home/suzkapu/.cache/ms-playwright/webkit-2359/minibrowser-wpe/bin/MiniBrowser: error while loading shared libraries: libicudata.so.74: cannot open shared object file: No such file or directory
Call log:
  - <launching> /home/suzkapu/.cache/ms-playwright/webkit-2359/pw_run.sh --inspector-pipe --headless --no-startup-window
  - <launched> pid=116917
  - [pid=116917][err] /home/suzkapu/.cache/ms-playwright/webkit-2359/minibrowser-wpe/bin/MiniBrowser: error while loading shared libraries: libicudata.so.74: cannot open shared object file: No such file or directory
  - [pid=116917] <gracefully close start>
  - [pid=116917] <kill>
  - [pid=116917] <will force kill>
  - [pid=116917] exception while trying to kill process: Error: kill ESRCH
  - [pid=116917] <process did exit: exitCode=127, signal=null>
  - [pid=116917] starting temporary directories cleanup
  - [pid=116917] finished temporary directories cleanup
  - [pid=116917] <gracefully close end>

```