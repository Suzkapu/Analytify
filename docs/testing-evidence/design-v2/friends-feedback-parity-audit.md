# Friends feedback and confirmation parity audit

Read-only investigation on 2026-10-23. No Figma, app, test or shared-document edits; no checks run. Fresh canonical reads, selected context/screenshots and exact Retry export are saved as `friends-feedback-parity-*`. Root's approved secondary candidates were not modified.

## Canonical state map

Current family `1008:32348`, existing review `1008:32349`; no duplicate QA frames are needed. Reference widths are576px desktop and358px mobile. Heights below include padding/border and genuine text wrapping; they are not prescribed fixed heights.

|State|Main variant|Desktop reference / height|Mobile reference / height|
|---|---|---|---|
|Loading|1008:32308|1008:32351 / 82|1008:32355 / 82|
|Refreshing|1008:32312|1008:32360 / 82|1008:32364 / 102|
|Busy|1008:32316|1008:32369 / 102|1008:32373 / 102|
|Load error|1008:32320|1008:32378 / 158|1008:32388 / 158|
|Change error|1008:32330|1008:32399 / 158|1008:32409 / 178|
|Unavailable|1008:32340|1008:32420 / 102|1008:32424 / 122|
|Profile required|1008:32344|1008:32429 / 82|1008:32433 / 102|
|Link unavailable|1009:32386|1009:32391 / 102|1009:32395 / 122|
|Owner unavailable|1014:32392|1014:32403 / 158|1014:32409 / 158|
|Accepted|1014:32415|1014:32426 / 158|1014:32432 / 178|
|Declined|1014:32438|1014:32449 / 158|1014:32455 / 158|

All11 state copies match the current `V2FriendsFeedbackComponent`. Exact copy remains in `friends-feedback-parity-canonical.json`. Every variant uses padding16, gap8, radius12,1px info border, surface-raised background; title Outfit60014/20 in info, body Outfit40014/20 in text-muted. Semantic values: surface-raised `24:11`=#182019; info `24:31`=#77B8FF; text-muted `24:17`=#A2ADA6. Visible action width260,height48, bounded by available inner width. Loading/Refreshing/Busy, Unavailable/Profile required/Link unavailable have no visible action. Load/Change error show Retry; Owner unavailable shows Create new invitation; Accepted/Declined show View friends. Old layer names “Enable device notifications” are residual names, not visible copy or a feature to restore.

Current source preserves these roles: loading/refreshing/busy polite status with aria-busy; load/change errors, unavailable and profile-required assertive alert; link/owner unavailable and confirmed outcomes polite status. Controller gates duplicate/stale actions, preserves cached data while refreshing, retries exact unacknowledged mutations, and retries reads only after acknowledged mutation plus failed confirming read. Existing tests already cover these service semantics; do not mirror all controller implementation branches in new tests.

## Confirmed visual corrections still required at source read

- Retry: current `.sync` is20×20 using `update-sync.svg`; canonical action icon `I1008:32323;227:11813` is18×18, main62:2363. Exact canonical SVG exported to `friends-feedback-parity-retry.svg`. Both use the same four path-command families; multiplying old coordinates by0.9 matches within0.000781 rounding, but both native SVGs retain stroke1.5. Simply scaling the old20px export to18px shrinks its stroke to1.35 and is not exact. Exported primary icon is accent-ink#06130B versus old muted#A2ADA6; use an appropriate semantic mask/currentColor. Identity and scale comparison JSONs record this without requiring a new asset dependency.
- Shared confirmation width currently `min(384px,100%)`; canonical Revoke `70:5858` and Remove Suzkapu `473:29338` are272px, fixed-width with content-hugging height. Revoke322px high; Remove294px. Inner width222px =272 minus48 padding and2 border. Preserve responsive fit for narrower/shorter windows.
- Revoke canonical danger action `70:5864` has Show icon=false. Current shared confirmation always renders trash. Remove canonical `473:29342` does have a trash icon. Condition the icon by action rather than removing it globally.
- Canonical danger actions use surface-raised fill and full danger border; current pending-invitation override does not cover confirmation's generic danger styling. Scope the modal control correction without weakening other gates.
- Open Revoke action `194:12449` and Remove `698:40824` specify150ms DISSOLVE/EASE_OUT. Current confirmation SCSS has no corresponding entry animation. Reduced-motion must remove it. Do not infer a success timeout from this presentation transition.

## Frozen modal contract

Exact geometry/typography: `friends-feedback-parity-modal-frozen.json`. Both dialogs use1px INSIDE border included in layout, padding24, gap16, radius24, background-raised#0B100D(`24:7`), border#34423A(`24:35`). Title Outfit60020/28, body40016/24, action60014/20. Buttons222×48, horizontal padding16/gap8. Revoke title “Revoke friend invitation?” wraps into56px; explanation72px. Remove Suzkapu title28px; explanation72px. Copy matches current component. Prototype disclaimer is explicitly invisible and should remain absent from the product.

Revoke body: “Disables this invitation’s private link and QR code. Existing friendships are unchanged.” Actions: Revoke invitation, then Cancel. Remove body: “Removes this person from your friends. You can send a new friend request later.” Actions: Remove friend, then Cancel. Other existing removal dialogs: Daniel_P473:29396, Alex473:29454, Paulzg473:29512. Preserve request-specific names/version guards.

Figma native overlay metadata has CENTER position, no backdrop/effects. The human's explicit blurred-popup requirement and current accessibility policy govern the product backdrop: **retain blur12, dimming, inert isolation, Cancel focus, Escape/backdrop cancellation and focus containment**. Do not remove those to reproduce Figma's native overlay limitation. Current close-before-write behavior matches prototype CLOSE followed by variable changes; do not keep a fake pending modal open solely to reproduce a screenshot.

## Bounded next browser acceptance work

1. Capture all11 feedback states at the canonical component widths (or document the actual page width and derived wrapping), using existing canonical refs above. Real workflow state must drive the capture: hold initial list reads for Loading; hold cached reload for Refreshing; hold mutation for Busy; fail reads for Load error; reject an unconfirmed write for Change error; invalid receive for Unavailable; earlier-session missing token for Link unavailable; consumed/revoked owner invitation for Owner unavailable; confirmed recipient decisions for Accepted/Declined. Profile-required should preserve route/security behavior: don't bypass guards just to keep a screenshot visible.
2. For each captured pending/error state verify correct aria-live/busy and action count, retained cached content where appropriate, disabled incompatible actions, no secret leakage, no horizontal overflow at narrow widths, footer/nav clearance in short/tall windows. Exercise Chromium/Firefox/WebKit, coarse pointer and normal/reduced motion without duplicate full end-to-end paths for every visual variant.
3. Hold Retry in flight and inspect keyboard focus when the Retry node disappears into pending. Current feedback component contains no focus-recovery mechanism; existing tests assert announcement/action removal but do not prove where browser focus lands. This is an **unverified acceptance gap**, not a claimed reproduced failure. Likewise verify focus after confirmed removal/revocation eliminates the previous trigger and after a reviewed decision replaces its controls with View friends.
4. Preserve existing mutation semantics: uncertainty retries same ID/decision/token; acknowledged write plus failed read retries only reads; busy blocks double activation; account replacement/logout and route change discard late results. Existing unit tests cover uncertain revocation, clipboard and QR retry, and stale account completions. Add native service-boundary assertions where meaningful rather than duplicating mocks. QR/copy failure use the same Change error UI but different local retry paths; they warrant workflow verification without separate canonical variants.
5. Snapshot both corrected dialogs, exact geometry/colors/icon policy plus no-write open/cancel, keyboard containment/focus return, click-outside cancel, and fit at short heights/long friend names. Existing native tests already assert Cancel-last, initial focus, Tab/Shift+Tab, Escape and blur12; their geometry loops assert containment, not272px canonical width or correct paints. Revoke workflow tests now exist and must remain intact.
6. Current existing browser screenshots cover Owner unavailable, outcome, and revoked review but lack approved deterministic snapshots for all11 feedback variants, delayed cold Loading, cached Refreshing, cold read error and mutation Busy/error recovery. Passing default Add/Invitations/Review snapshots does not cover these states.

## Related state requiring a separate design/acceptance decision

Current canonical Ready contains hidden genuine-empty references desktop `194:12384` (1136×100) / mobile `194:12537` (358×100), heading20/28 and “Add your first friend” action `194:12386` / `194:12539`. Current source renders only a14/20 status paragraph. Desktop reference width1136 differs from the freshly checked1120px Ready layout, so this state requires canonical normalization before UI implementation; don't blindly restore old fixed widths or residual features. This is distinct from load failure and should not be blessed as empty-on-error.

No parity completion claim is made. Root owns reproduction, corrections, current browser runs and baseline approval.

