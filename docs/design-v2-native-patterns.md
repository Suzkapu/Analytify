# Design v2 native UI patterns

Design v2 uses native HTML wherever it already provides the required semantics and browser behavior. A shared Angular component is appropriate only when Analytify must consistently add state mapping, focus management, validation wiring, or repeated presentation.

## Base page contract

Routes use the single width vocabulary `reading`, `form`, `default`, `dashboard`, `wide`, and `full`. Route metadata selects the shell width; `v2-page` inherits that space and does not make a second width decision. Application pages use a neutral container. Content that is independently meaningful may opt into `article` in its own template.

The standard page order is title and description, page actions, local choices, grouped tools, then content sections. Loading, empty, and error states use `v2-state`. Mobile title and back context come from route metadata so feature templates do not duplicate shell chrome.

## Approved control patterns

| Need | Approved implementation |
| --- | --- |
| Labelled field | Native `label` + input/select/textarea. Help and error text receive stable IDs referenced by `aria-describedby`; invalid controls use `aria-invalid`. |
| Select | Native `select` by default. A custom combobox is allowed only for measured search/autocomplete needs and must implement the APG combobox pattern. |
| Checkbox / switch | Native checkbox. Use `role="switch"` only when the interaction is immediately applied and the visual control exposes checked, disabled, and required states. |
| Radio / choice group | `fieldset` and `legend` with native radios. Use pressed buttons only for compact view/filter choices, never to imitate form radios. |
| Disclosure | Native `details`/`summary` when suitable; otherwise a button with `aria-expanded` and `aria-controls` for an element that actually exists. |
| Confirmation / alert dialog | `v2-modal` with the shared accessible-dialog behavior. Destructive consequences are written in the dialog and the safe action receives initial focus. |
| Banner / inline status | Semantic section with `role="status"` for non-urgent updates or `role="alert"` for errors requiring attention. Use `v2-state` for page/region states. |
| Toast | Retain only for short, non-essential confirmation. Announce through one polite live region and never make a toast the sole location of an error or required action. |
| Progress / loading | Native `progress` for measurable progress; `v2-skeleton` or `v2-state kind="loading"` for indeterminate loading with stable reserved space. |
| Workflow stepper | Ordered list with current step identified by `aria-current="step"`; steps are links/buttons only when users may activate them. |
| Table / data grid | Native table with `caption`, scoped headers, and ordinary links/buttons. Use an APG grid only when spreadsheet-style keyboard interaction is genuinely required. |
| Date selection | Native date input where supported and adequate. A custom calendar must follow the APG date-picker grid and provide typed-input fallback. |
| Avatar / artwork | Image with reserved width/height or aspect ratio and useful alt text; decorative images use empty alt. Off-screen artwork is lazy loaded. |
| Back / breadcrumb context | Shell-provided mobile back button for nested routes; native `nav` + ordered list for multi-level breadcrumbs. |

## Shared interaction rules

- Every interactive target is at least 44 by 44 CSS pixels; coarse-pointer targets should be 48 pixels where practical.
- A disabled link is removed from the tab order and cannot activate. Prefer a button when an action can be disabled.
- Local view choices use a labelled pressed-button group. APG tabs are used only when matching tab panels exist.
- A visual action row uses a labelled group. `role="toolbar"` is reserved for a control that implements roving focus and arrow-key navigation.
- Overflow menus follow the APG menu-button pattern: Arrow Down/Up opens and focuses an enabled item, menu arrows move focus, Escape closes, and focus returns to the trigger.
- Dynamic state is never communicated by color alone, and critical privacy/security information is never hover-only.

Feature-specific CSS may arrange feature content, but must not create a second button, dialog, form, table, or status system.
