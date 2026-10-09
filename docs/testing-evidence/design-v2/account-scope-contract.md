# Account menu: retained settings and intentional exclusion

Checkpoint: `0da961b`, branch `codex/design-v2`. This slice corrects a scope violation; it does not certify the legacy shell's visual parity.

The implementation plan and current feature-gap audit explicitly exclude blocked-user management. The account menu nevertheless rendered a Blocked users button for a cloud identity and dynamically imported its stable dialog. The old shell test required that obsolete action. The canonical design is not changed to restore it. Stable dialog code, service rules and stable interface remain untouched and remain in coverage denominators where executable.

Retained workflows: Notifications opens the actual notification settings component through the shared overlay host for either identity state. Automatic updates remains visible only with a cloud identity and opens the actual schedule component. Both close the account menu without deletion or logout. Cloud Backup, logout, Clear data, Privacy notice and the safe external Spotify account link remain available. Existing confirmation, busy/error, anonymous-logout and destructive sequencing tests remain required.

Before correction: corrected characterization run63928 produced 33 passes/one genuine exclusion failure. Initial6070 had that same failure and two invalid new test expectations based on compiler-generated class names; compare the component export identity instead. Those failures/logs are preserved. After correction48906 passed43 shell/overlay cases. The obsolete direct loader assertion now covers two retained settings rather than three; new rendered interactions additionally verify exact component exports and zero destructive effects.

The parity inventory removes the excluded management surface from B2 and explicitly records both intentional exclusions. The parity checker now rejects this menu/loader returning and requires the exclusion note; all other release/security checks remain intact. Historical matrix Complete labels are not fresh Figma evidence.

Native tests use isolated Spotify fixtures and block all unmocked remote requests. They exercise both identity and motion states, actual lazy settings components, keyboard activation, initial dialog focus, Escape/menu focus return, axe, and resize an open menu at320/390/1440 by480/1080. They require zero overflow, dialog bounds and actual Clear data hit-testing. They never click destructive or notification subscription actions and never use production data or send notifications.

First native61889:14 passes/two Chromium reduced-motion geometry failures. Artifacts preserved. Final test mechanics wait for initial dialog focus and loaded fonts, then poll the unchanged strict geometry and hit-test conditions together, storing the same successful sample. Final run/evidence is reported in the progress document; no arbitrary sleep, browser retry or golden update.
