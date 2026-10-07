# ADR 0006: Design system 2.0

- **Status:** Accepted (2026-10-06)
- **Phase:** 2 (revision, before phase 3)

## Context

A revised set of mockups was added in [`design/new-design/`](../../design/new-design/). Its design
system file is labelled **2.0** and adds a section `00 · Editorial layer — new in 2.0. Shared by
the landing page and the app.` The 1.0 mockups that phase 2 was built from are kept alongside it in
`design/new-design/v1/` (byte-identical to the files at the top of `design/`).

The **colour palette is unchanged** — every `--m-*` value in 2.0 matches 1.0. What changed is the
shape of the UI: surfaces, radii, control sizes and a display type scale.

## Decision

`design/new-design/` is the current visual reference. The top-level `design/*.dc.html` files are
1.0 and are superseded; nothing in code should be ported from them any more. The tokens in
`apps/web/src/app/styles.css` remain the source of truth for code (ADR 0005 still holds).

What 2.0 changes, and how it is implemented:

| Area | 1.0 | 2.0 |
|---|---|---|
| Surfaces | canvas → page → surface, cards outlined with a 1px border | one canvas tone for shell and content; panels are a tonal surface with **no border and no shadow**. `--m-page` is renamed `--m-inset` (`bg-inset`) and now means the inset tile (hover rows, notes, code) |
| Radii | 3 / 4 / 6 / 8 / 10 / 999 | 3 bar · 12 control (inputs, nav items, rows) · 16 inset (tiles, menus) · 24 panel and modal · 32 hero frame · 999 pill. `--radius-badge` is gone — badges, chips and segmented controls are pills |
| Buttons | 32px, 6px radius | **40px pills** (34px small). One primary per view |
| Type | the §02 scale (hero 52/500 … mono 11) | §02 is **unchanged**; an editorial scale is added on top: display XL/L, hero figure (clamp 64→112), page title 40/300, panel value 30/300, panel title 15/500, lead 18/400, mono eyebrow. Weight 300 only at ≥ 24px |
| Page title | 22/600 (`text-page-title`) | 40/300 (`text-page-display`), with an optional eyebrow line above it. `text-page-title` is kept for in-page headings |
| Shell | 220px sidebar, 56px bars, rules between regions | 236px sidebar, 76px bars, no rules; the active nav item is a tonal surface, not a bordered one |
| Page frame | max 1152, 24px padding, 24px gutter | max 1360, 40px padding, 20px gutter |
| Hero panel | a card like any other | 32px frame, the hero figure, and one faint teal glow at 10% opacity — never behind numbers or charts (`HeroPanel` in `components/finance/MetricCard.tsx`) |
| Motion | — | easing `cubic-bezier(.16,1,.3,1)` as `--ease-mizan`; 150ms hover/press, 600ms state changes. `prefers-reduced-motion` already disables all of it |

Since built (it was deferred when this ADR was written):

- **`Mizan Landing.dc.html`** (new in 2.0) is implemented at `/landing`, outside the app shell
  (ADR 0007): the 2.8s intro, the brand gradient, the hero's balance plates with their sway and
  bob, all seven scenes, the what-if slider and the assistant, the trust trio, the closing CTA and
  the footer. The scroll reveals are in `features/landing/useReveal.ts`; `prefers-reduced-motion`
  skips the intro outright and reveals everything at once.

Deferred, deliberately:
- Chart conventions ("Charts 2.0": smooth curves, no gridlines, one teal series, dashed context,
  22% → 0 area fade) are implemented in `components/finance/CashFlowChart.tsx` as inline SVG with
  Decimal geometry. visx arrives with the real charts in phase 11.
- The mobile mockup (`Mizan Mobile.dc.html`) is unchanged in 2.0 apart from the font weight, so the
  tab bar and sheets keep their phase-2 design.
- The landing page's number counters and the hero's parallax are not implemented; the reveals are.

## Consequences

- Phase 2 UI code was revised in place; no API, domain or contract code is affected.
- Light mode is lower-contrast by design (white panels on a `#f3f1ec` canvas, no borders). The axe
  contrast checks in `e2e/tests/design-system.spec.ts` pass in both themes, desktop and mobile,
  because text contrast is unchanged — only the panel outlines are gone.
- The contrast adjustments of ADR 0005 carry over unchanged; 2.0 did not alter any colour value.
