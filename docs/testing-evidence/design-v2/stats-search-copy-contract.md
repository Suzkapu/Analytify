# Stats inline search copy and canonical icon

Fresh canonical desktop7:97 and search25:139/25:141 read9October2026; visible target is “Search songs”, native text entry/immediate filtering, Clear restores results and no-results feedback belongs in the result area. Existing application supports matching artist names within songs; preserve that workflow and the accessible name “Search songs or artists”. Artist/genre category hints remain specific. Shared/read-only search remains local; no permission or service behavior change.

Use shared V2SearchFiltersComponent with an optional discrete local canonical icon instead of substituting PrimeIcons for the specified asset in Stats. Canonical18px icon slot contains the20×20 source Frame218:11640; retain SVG root dimensions. Input48px height,16px padding/typography,8px slot/text gap, control border#6b7d71 and surface#0d130f follow design values/tokens. Other consumers retain their existing component settings.

Period row87:3574 has no keyframe nodes in fresh authoritative motion context. Period click reactions change selected variables without transition; do not fabricate interpolation. Existing compact past-search220ms motion remains independently covered. Sidebar869:73478 stays provisional and untouched.

Characterize artist matching, case/whitespace normalization, clearing/no-results, query preservation across category changes and absence of extra retrieval before UI adaptation. Verify actual native typing, keyboard, focus, geometry, canonical icon loading/root/slot sizing and visual search states across four browser projects/normal and reduced motion. Whole Stats shell remains a separate unresolved parity requirement.

Evidence: stats-search-copy-design-context.json and stats-search-copy-controls-audit.json. Exact local SVG SHA256 efcda02f947b044dbb539dc6bf081a1793dac8b5a805be5d8f017acb0313253c.

Baseline native-label characterization found a duplicate ID: the Stats wrapper literal `id` and its internal native input both received `v2-stats-search`. Bind the component input without adding a literal host ID so the actual input owns the identifier and receives the label association. This changes no stable template or other search consumer. Final pre-change baseline97098 has two intended-behavior passes and two real copy/label failures; earlier logs retain the initially short-circuited label checks.
