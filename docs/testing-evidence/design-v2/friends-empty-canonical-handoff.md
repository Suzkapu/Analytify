# Canonical Friends genuine-empty state

Bounded normalization completed2026-10-23. Existing desktop frame194:12384 now resolves to1120×122 under1120px content parent192:11411 using FILL when visible. Existing mobile194:12537 remains358px wide and resolves to358×122 under parent192:11534. The earlier100px heights were stale hidden-layout values. No new frames, components, variables, styles or QA pages were created.

Both states retain “Your friends will appear here.”, Outfit SemiBold20/28; no body text. CTA “Add your first friend”, primary, Outfit SemiBold14/20,48px high, full inner width: desktop1086/mobile324. Existing people icon227:11786 remains enabled. Final screenshots show the inherited muted people glyph and accent-ink label; preserve the actual canonical icon paint rather than assuming every primary-control icon is the text color.

Card contract: vertical HUG, padding16, gap12,1px border included in layout, radius/card20, surface#121814(variable24:9), border#34423A(variable24:35), title#F5F7F5(variable24:15), primary accent#35E783(variable24:21). Heading and CTA fill the inner width. At narrow widths heading may wrap and height must grow naturally;122px is the measured reference at1120/358, not a fixed height.

Desktop CTA194:12386 retains navigation to Add192:11619; mobile194:12539 retains Add192:11744. Existing ON_CLICK Smart Animate900ms/EASE_IN_AND_OUT metadata was preserved exactly. It is prototype navigation metadata, not proof of application motion parity or authorization to hand-roll unsupported motion.

Visibility was temporarily unbound locally and enabled only on these existing empty frames for settled measurements and PNG export. No global visibility variable was changed. Final false value and exact visible bindingVariableID:191:11402 were restored. Both parent/sibling layouts and all captured card bindings/CTA properties/reactions compare equal before/after. While hidden, Figma's sizing getter reports FIXED; visible evaluation demonstrates FILL behavior (including the previously unchanged mobile state). See final JSON rather than interpreting the hidden getter as a fixed-width responsive contract.

Mutated/evaluated IDs:194:12384,194:12385,194:12386,194:12537,194:12538,194:12539. Desktop width is the only deliberate responsive-property correction. Own empty frames received settled height/positions through normal layout evaluation; unrelated nodes returned to identical geometry. No description was written because the owning nodes are FRAMEs and the Figma skill permits descriptions only on COMPONENT/COMPONENT_SET; this handoff records the responsive contract instead.

Authoritative geometry/copy/interaction preservation evidence: friends-empty-canonical-final.json plus friends-empty-canonical-settled.json. Full-bounds PNGs were visually inspected: friends-empty-canonical-desktop-before-full.png(1136×122), friends-empty-canonical-desktop-after-full.png(1120×122), friends-empty-canonical-mobile-after-full.png(358×122). Initial ordinary PNG exports were clipped by the existing parent viewport and are retained as investigation evidence; use the *-full files for review.

No application/test/shared-document edits, commits or deployments in this slice. UI implementation and native workflow checks remain with the root agent.
