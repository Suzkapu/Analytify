# Fresh confirmation wrapping review

Read-only canonical inspection on 23 October 2026, Figma file `5v8ckmlbfhMDWwP5sTdSXd`, page `7:2`, session `e32c96ec-90f7-4438-99d7-983245e01423`.

Current Revoke `70:5858` is 272×322, HUG vertical, padding 24, gap 16. Body `70:5860` is 222×72, HEIGHT autoresize, FILL horizontal, Outfit Regular variable weight 400, 16/24, zero letter spacing, no missing font. Copy is exactly the running application's copy. Fresh isolated full-node screenshot `friends-dialog-fresh-revoke-full.png` visibly has three lines:

> Disables this invitation’s private
> link and QR code. Existing
> friendships are unchanged.

Current Remove `473:29338` is 272×294; body `473:29340` is 222×72 with the same typography and resize settings. Fresh screenshot `friends-dialog-fresh-remove-full.png` confirms its three-line body. Exact live metrics, all text layers and segments are in `friends-dialog-fresh-metrics.json`. Hidden prototype-only explanatory copy remains in the node tree; it is not visible in either screenshot.

The existing current native capture directory `friends-confirmation-focus-native-artifacts` reveals an engine-specific difference: both Chromium desktop captures are 272×346, both Chromium mobile captures 272×347, while both Firefox and both WebKit captures are 272×322. Viewed the Chromium desktop and WebKit normal-motion captures directly. WebKit's wrapping matches Figma; Chromium has four body lines, with “unchanged.” alone on the last line. The canonical rendering therefore does not support normalizing Figma to 346 or forcing a fixed browser height. Inspect Chromium's actual loaded font face, computed weight, text width and first-line measurement before proposing a source correction.

No Figma writes, application edits, test edits or browser jobs were performed in this investigation. Exporting current nodes and screenshots did not change their layout. This review establishes a real wrapping discrepancy; it does not identify its runtime cause or claim it is fixed.
