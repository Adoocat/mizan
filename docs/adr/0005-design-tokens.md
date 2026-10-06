# ADR 0005: Design tokens and accessibility adjustments

- **Status:** Accepted (2026-10-06)
- **Phase:** 2

## Context

`design/Mizan Design System.dc.html` defines its colours as generated variables named after their
light-mode hex (`--m-f3f1ec-bg`), with dark as the default and light under `data-theme="light"`.
Those names don't say what a colour is for, and a few light-mode text colours fall just short of
WCAG AA contrast (4.5:1) on the backgrounds they're used on.

## Decision

- Tokens are ported to **semantic names** in `apps/web/src/app/styles.css` (`--m-canvas`,
  `--m-surface`, `--m-ink-2`, `--m-positive-soft`, `--m-data-pool`…) and exposed to Tailwind through
  `@theme` (`bg-surface`, `text-ink-3`, `text-value-l`, `rounded-card`…).
- **Theme:** dark is the CSS default, as in the design. The user can pick System, Light or Dark.
  System follows `prefers-color-scheme` without JavaScript; Light and Dark set `data-theme` on `<html>`.
- **Fonts:** Geist and Geist Mono are self-hosted through `@fontsource-variable`, with no Google Fonts
  request, so there's no third-party tracking and a strict CSP stays possible. Tabular numerals are on
  globally.
- **Contrast fixes** (light theme only), all checked by axe in Playwright in both themes:

  | Token | Mockup | Used | Reason |
  |---|---|---|---|
  | `--m-ink-3` (labels, meta) | `#77726A` | `#6E695F` | 4.3:1 on canvas → 4.8:1 |
  | `--m-warning` (text) | `#A86F12` | `#8F5D0E` | 3.7:1 on warning-soft → 4.9:1 |
  | `--m-positive` (text) | `#3B7D3A` | `#336F32` | 4.45:1 on positive-soft → 5.4:1 |
  | `--m-danger` (new; filled destructive buttons) | `#C2574D` in dark | `#B4423A` both themes | White text was 4.4:1 → 5.5:1 |

  Progress bars keep the mockup colours (`--m-*-bar`), since non-text graphics need only 3:1.
- The mockup's primary colour token is called `primary` in Tailwind (`bg-primary`), not `solid`,
  because `border-solid` is a Tailwind border-style utility.
- `cn()` registers the custom type scale with tailwind-merge. Otherwise `text-caption` is read as a
  colour and silently dropped next to `text-ink-3`.

## Consequences

Light-mode labels and success/warning text are slightly darker than in the mockups. Mockups stay
the visual reference; the tokens in `styles.css` are the source of truth for code.
