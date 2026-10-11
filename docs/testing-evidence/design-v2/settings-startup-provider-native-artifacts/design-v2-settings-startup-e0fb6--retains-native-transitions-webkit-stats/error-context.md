# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-settings-startup.spec.ts >> first Login renders directly and later Legal navigation retains native transitions
- Location: e2e/design-v2-settings-startup.spec.ts:6:5

# Error details

```
Error: browserType.launch: Target page, context or browser has been closed
Browser logs:

<launching> /home/suzkapu/.cache/ms-playwright/webkit-2359/pw_run.sh --inspector-pipe --headless --no-startup-window
<launched> pid=19717
[pid=19717][err] /home/suzkapu/.cache/ms-playwright/webkit-2359/minibrowser-wpe/bin/MiniBrowser: error while loading shared libraries: libicudata.so.74: cannot open shared object file: No such file or directory
Call log:
  - <launching> /home/suzkapu/.cache/ms-playwright/webkit-2359/pw_run.sh --inspector-pipe --headless --no-startup-window
  - <launched> pid=19717
  - [pid=19717][err] /home/suzkapu/.cache/ms-playwright/webkit-2359/minibrowser-wpe/bin/MiniBrowser: error while loading shared libraries: libicudata.so.74: cannot open shared object file: No such file or directory
  - [pid=19717] <gracefully close start>
  - [pid=19717] <kill>
  - [pid=19717] <will force kill>
  - [pid=19717] exception while trying to kill process: Error: kill ESRCH
  - [pid=19717] <process did exit: exitCode=127, signal=null>
  - [pid=19717] starting temporary directories cleanup
  - [pid=19717] finished temporary directories cleanup
  - [pid=19717] <gracefully close end>

```