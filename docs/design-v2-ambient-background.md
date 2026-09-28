# Design v2 ambient background

## One persistent renderer

Design v2 mounts exactly one `AmbientBackgroundComponent` in `DesignV2ShellComponent`, above the routed page outlet. Child navigation replaces page content but not the shell, so the same renderer survives route changes, scrolling, and every shell-owned menu or dialog. Feature pages must never mount another ambient renderer or provide decorative coordinates.

The renderer is fixed, outside document layout, non-interactive, and made from three composited layers: primary glow, secondary glow, and dots. It owns the only request-animation-frame loop. The loop runs outside Angular, is scheduled at most once per frame, and stops when its target settles or the document is hidden.

## State and lifetime

The shell supplies only semantic state:

- `ambientKey`: a stable route category such as `library`, `insights`, or `social`;
- normalized overlay state: none, tools, account, settings, or modal;
- shell mode: app, focus, or public.

The renderer measures normalized document scroll progress itself with one passive listener. `AmbientBackgroundState` composes route, scroll, overlay, shell mode, reduced-motion preference, and coarse-pointer capability into one procedural target. Semantic keys are hashed to deterministic targets; neither route names nor menus contain background coordinates.

Opening an overlay applies a small generic side/depth transform and calms intensity and dot movement. Closing it returns to the current route-plus-scroll target. Navigating from an open menu closes the menu and updates the route target without destroying or resetting the renderer.

## Motion and native platform primitives

Angular Router View Transitions are enabled for supported browsers. They transition routed content only; the persistent shell background is real live UI and is not recreated to imitate continuity. Browsers without the View Transition API use normal Angular navigation with the same behavior.

Local menus and sheets use shared CSS motion rather than a JavaScript animation framework. CSS scroll-driven animation is intentionally not used for the combined ambient engine because its target depends on route, scroll, overlay, shell mode, and user preferences—not scroll alone. A future decorative effect that depends only on scroll may use a CSS scroll timeline after measuring that it is simpler and cheaper.

The Analytify-specific code is limited to semantic-state composition, procedural target generation, and damped interpolation. No third-party animation runtime, general timeline, route snapshot framework, or per-page controller is permitted.

## Reduced motion and mobile

With `prefers-reduced-motion: reduce`, scroll parallax and continuous interpolation stop. Semantic state changes render a stable, low-intensity target immediately, preserving the visual identity without continuous motion. Coarse pointers retain the renderer but reduce scroll displacement and visual intensity.

## Adding a route

Add a semantic `ambientKey` and `chromeMode` through `designV2RouteData`. Reuse an existing category where possible. Do not edit ambient math, add coordinates, mount a renderer, or create an animation loop in the feature page.

## Prohibited patterns

- ambient/background components inside feature pages;
- page- or menu-specific coordinate tables;
- DOM particle collections;
- per-page, per-menu, or per-overlay animation loops;
- layout-affecting animation or interactive background elements;
- `transition: all` or a general animation dependency for this system;
- relying on animation support for navigation correctness.

## Test strategy

Math tests prove deterministic route, scroll, overlay, and shell-mode composition. State and component tests prove reduced-motion behavior, visibility pausing, one-frame scheduling, and return to the base state. Shell tests compare component identity across routes, menus, and shell modes. Browser tests verify scroll/overlay CSS state changes, identity persistence across navigation, reduced motion, responsive reflow, and accessibility.
