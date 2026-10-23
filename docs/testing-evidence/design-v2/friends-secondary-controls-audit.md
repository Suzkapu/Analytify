# Secondary Friends controls: canonical measurements

Read-only Figma audit, 2026-10-23. File `5v8ckmlbfhMDWwP5sTdSXd`, page `7:2`. Exact properties and paint bindings are in `friends-secondary-controls-canonical.json`. No Figma/app mutations or test runs.

Every navigation frame fills available width, wraps horizontally, uses12px gap, and has zero padding. Every tab is `FILL`, `layoutGrow:1`, `minWidth:120`; measured widths are resolved geometry, not fixed tab widths. Mobile Friends retains16px horizontal padding; mobile **Invitations position** uses8px horizontal padding regardless of which tab is active. Desktop both use16px. Secondary tabs have a1px border included in layout; primary active tabs have no stroke.

| Screen | Nav ID | Friends ID / width | Invitations ID / width | Border Friends / Invitations |
| --- | --- | --- | --- | --- |
| Add desktop1120 |194:12399|194:12400 /554|194:12403 /554|1 /1|
| Add mobile358 |194:12552|194:12553 /181|194:12556 /165|1 /1|
| Invitations desktop1120 |194:12432|194:12433 /555|194:12436 /553|1 /0|
| Invitations mobile358 |194:12585|194:12586 /182|194:12589 /164|1 /0|
| Review desktop1120 |194:12459|194:12460 /554|194:12463 /554|1 /1|
| Review mobile358 |194:12612|194:12613 /181|194:12616 /165|1 /1|

Applying padding8 to every mobile secondary tab erases this positional distinction and yields incorrect173/173 on Add/Review. Ready's180/166 is specific to its borderless active Friends / bordered Invitations combination; it is not the target for every secondary screen.

Revoke controls desktop`194:12449` / mobile`194:12602`:112×48, gap8, horizontal padding16, fixed sizing. Fill is solid, opacity1 `color/surface-raised` (`VariableID:24:11`, resolved RGB24,32,25 / `#182019`). Border is solid1px, opacity1 `color/danger` (`VariableID:24:27`, resolved RGB255,116,125 / `#FF747D`). Both bindings are direct semantic variable aliases; this is neither the ordinary surface token nor a translucent danger tint/mixed border. Compare the application semantic tokens to these resolved values before capture approval.
