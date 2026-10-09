# Stats content composition contract

Canonical owner frames: desktop `7:97`, mobile `25:791`. Shared frames: desktop `330:15889`, mobile `330:16194`. Shared permissions were corrected through existing instance properties; exact changes are in `stats-composition-shared-figma-correction.json`.

| Slot | Canonical evidence | Application contract |
| --- | --- | --- |
| Title | Heading family `139:7724`; instances `87:3570` / `330:15897` | Own `Your top listening`; shared actor name followed by ` · Listening stats`. Outfit 700, 36/44 desktop, 28/36 mobile. No eyebrow. |
| Description | Same heading family | Own ranking description; shared read-only snapshot description and valid refreshed date. 16/24, 8px below title; hidden on mobile. Invalid dates never produce a refreshed-date claim. |
| Back | Shared heading, asset `241:14382` | Shared-only 92×44 action, local 18×18 SVG; native keyboard navigation returns to prior route. Owner cannot invoke this action. |
| Content rhythm | `139:8246` / `139:8294` | 16 desktop / 12 mobile outer gaps; mobile content has 16px side insets. Existing semantic 1120px maximum retained until the shell migration. |
| Resolved category | `45:1864`, variable `110:3638` | `Top songs`, `Top artists`, `Top genres`; 20/28, 600. Ranking loading/error feedback replaces the resolved results. |
| Playlist action | `209:11524/11525`, `25:165/25:853` | Own Songs only; centered 240×48, 14/20, 600, 18px list icon. Existing create/retry operation preserved; busy prevents duplicate clicks. |
| Shared permissions | Master `161:8697`, 18 corrected copied instances | No private History, comparison, past-search or playlist creation actions. Period/category/search and safe Spotify destinations remain available. |

`e2e/design-v2-stats-composition.spec.ts` uses isolated mocked services, fixed date, real controls, six widths and two heights, four browser projects, normal/reduced motion, axe, keyboard Back, delayed request completion, denied access and recovery. Geometry and original PNGs are durable evidence separate from application coverage.

This contract does not establish whole-page parity. The surrounding shell/navigation still differs from the canonical sidebar/mobile shell. Complete canonical page loading/error/empty compositions remain missing. Shared Back prototype hover is 120ms ease-out dissolve, while the existing shared button uses 160ms ease; Back hover/motion parity remains open. General checkbox/switch/hover motion and CalendarRetry motion export remain open; provisional sidebar motion is unchanged. Final results and coverage are recorded in `docs/design-v2-testing-progress.md`; candidate visual captures are never treated as approved regressions before review and a strict rerun.
