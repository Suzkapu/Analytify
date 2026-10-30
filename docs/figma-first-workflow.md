# Figma-first interface workflow

Figma is the visual and interaction reference for new user-facing work. Angular
owns the running application, data access, permissions, and product behavior.
Changes follow this workflow on `codex/design-v2`. The user-authorized branch
pipelines select the root frontend; `/new` is now a compatibility redirect.
The release boundaries in `development-and-releases.md` still apply.

## Design reference

- File: https://www.figma.com/design/5v8ckmlbfhMDWwP5sTdSXd/Analytify
- Canonical page: `7:2`, Analytify Design v2 — Layout System.
- Use canonical product screens and shared components as the implementation
  reference. Keep responsive validation, mechanics, and legacy copies separate.

## Feature cycle

1. Inspect existing code and identify the real workflow, data requirements, and
   constraints. Resolve any mismatch between the requested behavior and the
   available backend before promising that behavior in the design.
2. Add or update the feature in Figma using shared components and semantic
   variables. Include relevant desktop/mobile layouts, interactive states,
   loading/error/empty states, dialogs, and responsive behavior.
3. Record the canonical Figma node links and an interaction contract in the
   feature's implementation notes: triggers, resulting state, navigation,
   data effects, permissions, and recovery behavior. Incorporate user design
   feedback before implementing dependent interface changes.
4. Transfer assets and design values, then implement reusable Angular components
   and responsive layouts. Adapt feature state and logic to the intended flow;
   preserve established data integrity and release boundaries.
5. Compare browser screenshots with the canonical designs at representative
   widths and heights. Test real interactions, keyboard/focus behavior, external
   links, data effects, and relevant existing checks. Feed necessary design
   corrections back into Figma so the design and implementation stay aligned.

## Repeatable handoff

- Reuse existing SVG/icon assets where they already match the design. Export
  discrete new graphics as SVG or appropriate image assets. Never export an
  entire page as an image to serve as the implemented interface.
- Map Figma colors, spacing, typography, and radii to the existing semantic
  tokens in `src/styles/_design-v2-tokens.scss`. A future token export/sync step
  should produce a versioned manifest with stable names and explicit aliases;
  review changes before generating website styles.
- Maintain stable links between shared Figma components and Angular components.
  Code Connect is a suitable future mapping layer; it supplies implementation
  references, not automatic feature generation or deployment.
- Use one responsive implementation per page. Reference frames and prototype
  state copies must not become duplicate Angular pages or fixed coordinates.

This document establishes the workflow. It does not mean a token exporter,
Code Connect mappings, or an automatic Figma-to-website pipeline is installed.
