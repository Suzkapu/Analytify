# Friends empty-state DOM and workflow characterization — 23 October 2026

Scope: new `src/app/features/friends/v2-friends-empty-state.spec.ts` and `friends-empty-test-*` evidence only. Production page, controller, existing specs, canonical design and pipelines are owned elsewhere and were not edited by this testing slice.

## Canonical contract

The current canonical empty states are desktop `194:12384` and mobile `194:12537` in the Analytify Figma file. Exact copy confirmed by the design agent and `friends-empty-canonical-normalization.json`: heading **“Your friends will appear here.”**, primary action **“Add your first friend”**, no additional body copy. The heading treatment is Outfit SemiBold 20/28; the action navigates to the real Add friend workflow (`192:11619` desktop, `192:11744` mobile). Responsive geometry and the design agent's desktop-width normalization are outside these jsdom tests.

## Actual RED

`friends-empty-test-red.log`: exit 1, **3 failed / 3 passed / 6 tests / 1 file**. Failing behavior:

- The canonical copy is a status paragraph without the expected section heading.
- The missing “Add your first friend” navigation link prevents entering the actual Add workflow from the empty state.
- Declining an incoming request leaves the empty state without its action.

Passing characterization:

- Zero connected friends does not hide incoming request Accept/Decline actions and does not create an invitation automatically.
- Independent pending invitations remain reachable on their own tab, revocable and unchanged without creating a replacement invitation.
- Accepting an incoming request replaces the empty state with the connected friend and preserves the independent invitation.

Baseline page template SHA256: `d83501e15fd2596d003651946027c3b0310b50f720fab91bfbd0e25be2711e25`. Page controller/component SHA256: `e2c8309fb592e0750b244e408cae2135dd310855af9e01e631d6d7d9d14efc68`. The RED was reported to the parent before any production UI change in this slice.

The suite mounts the actual `FRIENDS_ROUTES`, Angular `RouterTestingHarness`, page and route-owned controller with isolated public FriendsService boundary fixtures. No private method calls, private state overrides or mocked UI components are used. The QR renderer is stubbed, so the tests can assert Add workflow/link presentation without pretending to validate QR decoding. No endpoint, production data or notification is used.

The action test requires native link semantics, the exact visible name, a real Add route href and keyboard focusability. It clicks the real link and asserts exactly one explicit invitation creation with the returned token. Native keyboard activation, visual styling, responsive dimensions and browser accessibility remain parent browser-test responsibilities.

## Commands

```sh
npx ng test --watch=false --progress=false --include='src/app/features/friends/v2-friends-empty-state.spec.ts' --runner-config=docs/testing-evidence/design-v2/friends-empty-test-vitest.mjs
npx eslint src/app/features/friends/v2-friends-empty-state.spec.ts
npm run typecheck:tests
```

Targeted ESLint exited 0. Full test typecheck status and final source hashes are recorded in `friends-empty-test-result.json` when terminal. No coverage measurement or migration completion is claimed. The production UI implementation and subsequent GREEN/browser verification remain pending with the parent.
