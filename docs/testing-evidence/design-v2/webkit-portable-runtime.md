# Local WebKit verification environment

6 October 2026, CachyOS x86_64, Playwright 1.63.0 / downloaded WebKit build 2359. The default launch cannot find Ubuntu-compatible ICU74, libxml2 and flite libraries. Installing host packages was unavailable because sudo requires interactive credentials.

A temporary runtime used the **unmodified downloaded Playwright WPE binary** with libraries extracted beneath `/tmp/analytify-webkit-libs/root`. No host libraries, browser-cache files, repository browser configuration or test assertions were changed to make the runtime launch. A temporary config selected the existing `webkit-stats` project and set its executable to a wrapper exporting the normal WPE resource paths plus the temporary library directory.

Official archive downloads and measured SHA256:

| Package | SHA256 |
| --- | --- |
| `https://archive.ubuntu.com/ubuntu/pool/main/i/icu/libicu74_74.2-1ubuntu3.1_amd64.deb` | `c9a70989678660eed9a1e904c74fa043da8bec8e2036856fc16e31ced79b04f8` |
| `https://archive.ubuntu.com/ubuntu/pool/main/libx/libxml2/libxml2_2.9.14+dfsg-1.3ubuntu3.9_amd64.deb` | `6e578bc383096718c9eea8a76a3edfacfea06e525e1aa7a187ee41906436d94e` |
| `https://archive.ubuntu.com/ubuntu/pool/universe/f/flite/libflite1_2.2-6build3_amd64.deb` | `367f1d0da5cd38759a0515eafc27aa133b2d7bf99308cac34831df0212e96b75` |

Measured hashes identify downloaded bytes; they are not an independent archive-signature verification.

Wrapper environment:

```sh
webkit_runtime=/home/suzkapu/.cache/ms-playwright/webkit-2359/minibrowser-wpe
export WEBKIT_EXEC_PATH="$webkit_runtime/bin"
export WEBKIT_INJECTED_BUNDLE_PATH="$webkit_runtime/lib"
export WEBKIT_INSPECTOR_RESOURCES_PATH="$webkit_runtime/share"
export LD_LIBRARY_PATH="$webkit_runtime/lib:$webkit_runtime/sys/lib:/tmp/analytify-webkit-libs/root/usr/lib/x86_64-linux-gnu"
exec "$webkit_runtime/bin/MiniBrowser" "$@"
```

Command: `node node_modules/@playwright/test/cli.js test --config=/tmp/analytify-webkit.config.ts`. The config imports the repository config, sets absolute test/server working directories, selects `webkit-stats` and supplies the wrapper executable. Chromium/Firefox runs use the repository config directly.

Scope: headless WebKit Stats flame workflow, geometry, keyboard history/focus recovery, axe and reviewed row screenshots. This is not Safari-device or full-application parity evidence. Preview CI installs standard Playwright dependencies on Ubuntu and retains the ordinary enabled WebKit project; its remote run remains unverified until CI executes.
