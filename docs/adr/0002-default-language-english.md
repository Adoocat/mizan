# ADR 0002: English is the default UI language; Turkish is available

- **Status:** Accepted (2026-10-06)
- **Decision:** D2 in `docs/PLAN.md` §22 (changed from the recommended default)

## Context

The plan recommended i18n from day one with Turkish as the default UI language. The product owner
chose English as the default instead, with Turkish fully available.

## Decision

- i18next with `en` and `tr` resources from Phase 0. **`en` is the default and the fallback.**
- A user's language choice is remembered on the device. After Phase 3 it is also stored on the user
  (`users.locale`).
- The browser language is not auto-detected, so first-time users always see English.
- Number and money formatting follows the selected locale (`tr-TR`: `₺50.000,50`; `en`: `₺50,000.50`).
  Formatting and parsing live in `packages/domain`, not in `Intl`, so the output is identical in
  Node and every browser.
- `CurrencyInput` accepts both separators whatever the UI language, so `50.000,50` and `50,000.50`
  both work.

## Consequences

- Every user-visible string goes through i18next; Turkish translations ship in the same phase as the
  English text.
- Turkish-specific behavior (dotted/dotless `İ/ı` search, `tr-TR` number formats) is still required
  regardless of the UI language.
