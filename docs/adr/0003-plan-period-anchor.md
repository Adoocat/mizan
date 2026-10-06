# ADR 0003: Plan periods are monthly, anchored to an editable start day

- **Status:** Accepted (2026-10-06)
- **Decision:** D3 in `docs/PLAN.md` §22

## Context

A plan period is one budget month. Salaried users in Türkiye often get paid on a fixed day that isn't
the 1st, and their month effectively starts on payday. Two models were considered:

1. **Monthly, anchored to a start day (1–28).** Periods follow the calendar month and are 28–31 days
   long.
2. **Fixed length (for example 30 days).** The start date drifts against the calendar, so a monthly
   salary or rent can land twice in one period or not at all.

## Decision

Option 1. Each workspace has a `period_start_day` from 1 to 28, **defaulting to 1**, chosen during
onboarding and editable in settings.

- With start day *d*, the period containing date *x* starts on day *d* of *x*'s month if
  `x.day ≥ d`, otherwise on day *d* of the previous month. It ends the day before the next start.
  - Start day 1: Oct 1 – Oct 31, Nov 1 – Nov 30, Feb 1 – Feb 28/29.
  - Start day 15: Oct 15 – Nov 14, Nov 15 – Dec 14.
- In the domain, a period is the half-open range `[start, end)` of plain dates. The database stores
  explicit `start_date` and `end_date`, so changing the start day never rewrites past periods.
- Days 29–31 aren't allowed, so every month has the start day.

## Consequences

- Changing the start day takes effect from the next period. Phase 6 defines how the transition
  period is shortened or lengthened.
- Period lengths vary between 28 and 31 days. Daily figures (safe to spend today) always divide by the
  actual days left.
