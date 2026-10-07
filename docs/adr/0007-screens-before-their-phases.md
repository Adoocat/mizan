# ADR 0007: Design-complete screens ahead of their phases

- **Status:** Accepted (2026-10-06)
- **Phase:** 2 (revision, before phase 3)

## Context

Phase 2 delivered the design system and an app shell whose pages were placeholders. The mockups in
`design/new-design/` describe six rich screens, and the plan schedules them across phases 4–11 —
each waiting on API work that does not exist yet.

That left the running app looking nothing like the mockups, which made the design impossible to
judge and the remaining phases harder to review: a layout problem found in phase 11 is a layout
problem that has been wrong since phase 2.

## Decision

Build **every screen in `design/new-design/`** now, at full visual fidelity, reading **placeholder
data** from two modules: `apps/web/src/lib/sample-data.ts` (the daily screens) and
`apps/web/src/lib/wealth-data.ts` (Savings, Investments, Debts, Net worth, Reports, What-if).

That includes the v1.1 screens — Investments, Net worth, Debts, Savings, Reports and the What-if
simulator — and the assistant drawer, so the sidebar matches the mockup rather than the MVP subset
(this supersedes ADR 0004's navigation merges).

- The data is the mockups' own figures (Thursday 22 October 2026), expressed as `Money` and
  `Decimal` — never `number`. The money rules apply to sample data too; otherwise the components
  would be built against the wrong types and every later phase would have to re-do them.
- Every page reads it through `useSampleData()`. Wiring a page to the API in its own phase means
  replacing that one call with a TanStack Query hook — the components, layout and i18n stay.
- Each screen carries a visible line: "Sample figures from the mockups. Live data arrives in
  phase N."
- No derived financial logic lives in the pages. Where the mockups show a computed number
  (safe-to-spend, remaining, pace), the sample data states it; the real calculation arrives with
  `packages/domain` in its phase, as PLAN §10 requires.
- The landing page (new in 2.0) is built at `/landing`, outside the app shell, which is why the
  router now has a pathless layout route. Its "Sign in" and "Start using Mizan" links point at the
  app until auth exists in phase 3. Its figures live in `features/landing/landing-data.ts`, apart
  from the app's sample data: it is marketing copy, not a view of the user's plan. The what-if
  projection is real compound arithmetic in Decimal, not a canned number.

## Consequences

- The phase tracker still governs **behaviour**: a screen is "done" when its phase wires it to the
  API, adds its mutations and its domain tests. What phases 4–11 inherit is the finished UI.
- There is a real risk of sample data drifting into looking like a feature. The single module, the
  `useSampleData()` seam and the per-page note are the guard; a phase that wires a page must delete
  its slice of the module.
- Interactions that need the API are intentionally absent: no editing a plan line, no splitting a
  transaction, no bulk actions, no connecting an account. The controls that would start them are
  present and inert. The three simulators are real, though: the what-if slider, the debt extra
  payment and the landing projection all compute in Decimal from the placeholder figures.
- The assistant drawer answers from the mockup's two scripted questions. Nothing is sent anywhere;
  the real assistant is v1.1.
- Accessibility is covered now rather than later: axe runs over all nine routes in both themes, on
  desktop and mobile (`e2e/tests/design-system.spec.ts`), waiting for the landing intro to finish
  so it measures the settled page.
- A reveal-on-scroll hides content until an observer fires, so `useReveal` has a 2.5s fallback that
  reveals everything if no callback ever arrives. Without it, a document that is never visible —
  an embedded or background view, where Chromium does not deliver IntersectionObserver callbacks —
  would show a blank page.
