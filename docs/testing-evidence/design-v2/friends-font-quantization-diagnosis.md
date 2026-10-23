# Friends dialog font quantization diagnosis — 23 October 2026

The Chromium Revoke dialog's extra line is reproducibly caused by legacy headless-shell font hinting, rather than font readiness, the application copy, or the declared font size. No application or test configuration was changed during this investigation.

The isolated probes embed the exact installed `@fontsource-variable/outfit` Latin variable WOFF2 as a data URL and render the same paragraph at400 weight,16px/24px and222px width. No application server, user data, or remote service is involved. Each mode was checked at device scale factors1 and2.625.

| Chromium153 mode | First-line advance | Fractional individual glyph advances | Paragraph height |
|---|---:|---:|---:|
| Legacy headless shell default |226px|0|96px|
| Legacy headless shell explicit full hinting |226px|0|96px|
| Legacy headless shell slight hinting |221.23243713378906px|16|72px|
| Legacy headless shell no hinting |221.23243713378906px|16|72px|
| Full Chrome modern headless default, no font flag |221.23243713378906px|16|72px|

These values match the application diagnostic: Chromium's default shell measures226px and wraps four lines; WebKit measures221.23243713378906px and wraps three lines; Firefox measures221.25px. Waiting for fonts.ready does not change those values.

The official Chromium headless switch declaration states that `--font-render-hinting` affects Skia rendering and glyph subpixel positioning, with a default of full: https://chromium.googlesource.com/chromium/src/+/HEAD/headless/public/switches.h (lines81–84; viewed23 October2026). The source's declaration corroborates the direct same-binary default/full/slight/no-hinting experiment. Full Chrome's modern headless default provides an independent control without overriding font hinting.

Installed Playwright defaults add no font-render-hinting or disable-font-subpixel-positioning switch. Its registry identifies Chromium/headless-shell revision1243 as153.0.8010.12. The host's fontconfig hintslight entry alone does not describe the legacy headless shell's default.

Reproduction:

- `node docs/testing-evidence/design-v2/friends-font-quantization-probe.mjs`
- `node docs/testing-evidence/design-v2/friends-font-quantization-full-chrome-probe.mjs`

Both commands exited0. Their corresponding result JSON files retain each individual glyph measurement; corresponding logs summarize all ten samples. The second command uses Playwright's `channel: 'chromium'` solely inside the isolated probe. No running application's geometry or screenshot assertions were changed.

This establishes a test-browser rendering difference, not permission to weaken dialog geometry assertions. A subsequent application run must choose and document its browser rendering contract and verify unchanged canonical dimensions. Any browser setting change may affect previously reviewed images; existing snapshots must not be blindly updated. This font-only evidence does not prove the running Friends dialog, wider browser workflows, or all visual baselines pass under a different rendering mode.
