# Analytify Design v2 system

Design v2 is scoped below `.design-v2`; its tokens and primitives must not change legacy pages. Feature components provide UI-ready content and react to outputs. Shared UI components do not fetch Spotify or Supabase data, resolve routes, or contain product rules.

## Tokens

The semantic token source is `src/styles/_design-v2-tokens.scss`. Tokens describe roles rather than individual pages:

- colour: background, raised background, surface, raised surface, input, selection, borders, three text levels, accent, danger, warning, info, success, and focus;
- spacing: a four-pixel scale from `--v2-space-1` through `--v2-space-16`;
- shape: control, card, panel, sheet, and pill radii;
- content widths: reading, form, default, dashboard, and wide;
- mobile measurements: header, bottom navigation, gutter, normal/touch controls, and sheet radius.

Use the semantic role that matches the meaning. Do not introduce a page-specific colour or arbitrary gap when an existing token represents it. Focus indicators use a two-pixel high-contrast outline. Normal controls have a minimum 44px hit area and coarse-pointer controls expand to 48px.

## Page anatomy

`v2-page` owns the content width, header, eyebrow, title, description, action area, tabs, toolbar, and standard section rhythm. Choose the narrowest appropriate width:

- `reading` for prose;
- `form` for focused input flows;
- `default` for ordinary pages;
- `dashboard` for data-rich pages;
- `wide` only when the content benefits from it.

Project actions with `v2PageActions`, tabs with `v2PageTabs`, and a toolbar with `v2PageToolbar`. The remaining content becomes the consistently spaced page sections.

## Components and action hierarchy

- `v2Button`: explicit `primary`, `secondary`, `tertiary`, `danger`, or `icon` variant. Default to secondary and keep one obvious primary action per task region.
- `v2-card` and `v2-list-row`: standard surfaces. Rows reserve intrinsic space and use off-screen content visibility.
- `v2-section-header`: consistent section title, explanation, and action placement.
- `v2-status-badge`: accepts a known status and always renders user-facing copy through `designV2StatusPresentation`.
- `v2-tabs`: native-button tabs or segmented controls with roving focus, arrow, Home, and End behavior.
- `v2-search-filters`: explicitly labelled native search input plus toggle filter chips.
- `v2-toolbar`: labelled action grouping.
- `v2-state`: shared empty, loading, and error presentation with appropriate live-region behavior and an optional action.
- `v2-modal`: shared desktop dialog/mobile bottom sheet using the app's focus trap, Escape handling, inert background, and focus restoration.
- `v2-overflow-menu`: interaction-mounted APG-style menu with arrow, Home, End, and Escape support.
- `v2-skeleton`: accessible loading label with explicit reserved width and height.

Hidden modal and menu trees are not mounted. Animations use transform/opacity-compatible properties and stop for reduced motion. Components use stable IDs for repeated options and expose disabled, selected, busy, error, and announcement state programmatically.

## Status wording

Raw backend values must never appear in templates. Extend the exhaustive `DesignV2KnownStatus` map when a domain introduces a new status, then test the readable label and semantic tone. If a value cannot be mapped safely, update the mapper rather than interpolating it into a component.
