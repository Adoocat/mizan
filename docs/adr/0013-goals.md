# ADR 0013: Goals — emergency funds, savings goals and sinking funds

- **Status:** Accepted (2026-10-11)
- **Decision:** **D10**, **D11** and **D12** in `docs/PLAN.md` §22, plus the choices phase 8 had to
  settle around them
- **Phase:** 8

## Context

§9 describes a goal as a *purpose with a target*, funded by **contributions** — earmarks over money
the user already has, rather than a pot money is moved into. That much was settled. Three things
were not, because §9's prose and the schema sketch in §7 disagreed or stopped short:

1. §9 says an emergency fund's target is "months × essential monthly expenses (from the **current
   plan's** essential + debt lines)", while the sketch gives `goals` a `target_amount` column —
   which would be a snapshot of exactly that figure.
2. `target_date` is nullable, but required monthly is defined as `(target − current) ÷ contribution
   months left`. With no date there is no denominator.
3. A sinking fund's `repeat` "resets after payment", with nothing said about what triggers the
   reset or which phase owns it.

Two smaller questions came up while building: whether a goal may hold more than its target, and
what archiving one does to its earmarks.

## Decision

### D10: an emergency fund's target is derived, never stored

`emergency_months` × the current period's essential **and** debt plan lines, recomputed on every
read. `target_amount` is `NULL` for `type = 'emergency_fund'`, and a check constraint
(`goals_target_matches_type`) makes the two mutually exclusive in the database rather than in a
service.

The target then follows the household's real cost of living: raise the rent line and the fund you
need grows with it, with no edit to the goal and no "your essentials changed — update your target?"
prompt to ignore. A snapshot would have needed that prompt, a second code path to apply it, and
would have left every fund quietly wrong in between.

Debt counts as essential here because a loan installment does not pause when an income does. The
three-month **actual** average is read alongside the planned figure, so a plan that understates the
real cost of living is visible instead of silently shrinking the target.

### D11: no target date means no required monthly

`requiredMonthly` returns `null` rather than a number. The card shows progress, what is saved and
what is left; where the goal has a plan line it shows the month that line would finish the job
instead, derived and labelled as a projection.

The alternatives were to force a date on every savings goal — which asks the user to invent one —
or to take a monthly amount as a third kind of input. Both add surface for a question the user has
already answered by leaving the date empty: *I want this, I do not have a deadline.*

Required monthly is rounded **up** to the minor unit, which is the opposite of the daily
allowance's rounding and for the same reason. An allowance must never promise more than there is; a
contribution must never fall short of the target. ₺10,000 over three months is ₺3,333.34, and three
of those clear the goal.

### D12: `repeat` is stored now and resets in phase 9

Phase 8 stores and displays it. Rolling `target_date` forward after a repeating fund is paid lands
with recurring (phase 9), which already owns schedule arithmetic and its edge cases — month ends,
leap years, skipped occurrences.

Doing it here would have duplicated that arithmetic in a second place, with its own tests, weeks
before the module that does it properly arrives.

### Over-funding is allowed

A goal may hold more than its target; progress passes 100% and the card says so. A goal holding
more than it needs is information, not an error, and refusing the contribution would be the app
telling someone they may not save.

The warning §9 *does* ask for is a different check: over-**earmarking**, where the goals kept in one
account earmark more than that account holds. It is a warning and never a refusal — earmarks are
the user's own bookkeeping, and the app only has to be honest that the money is not there yet.

### Archiving keeps the history and drops the earmark

An archived goal keeps every contribution: they are what happened. Its earmarks stop counting
against the account it is kept in, because the user has put the goal away and a standing warning
about it would be noise. A plan line pointing at it is left alone — clearing an allocation is its
own decision — and the plan drops the row once the line is gone.

## How the figures are built

**What a goal holds** is `Σ contributions − goal-funded spending`:

```
saved = earmarked − spent
```

where `earmarked` is the signed sum of `goal_contributions` (an earmark positive, a release
negative) and `spent` comes from the **ledger**: the transaction lines carrying this `goal_id`.

Spending out of a goal is deliberately *not* stored as a negative contribution. The ledger stays
the single source of truth, so correcting the expense's amount — or undeleting it — moves the goal
with it. A second row would be free to drift, and nothing would notice.

**Goal-funded spending is excluded from the plan's category sums** (`sumActualByCategory`). The
money was earmarked in an earlier month, so counting it again here would charge it to this month's
plan twice and pull down available to spend. Leaving it out is precisely what makes a sinking fund
work: the insurance you saved for all year does not blow up the month you pay it.

**A goal line in the plan** measures the contributions dated in the period (§10), which is what
"add to plan" is for: the user has just been told they need ₺3,000 a month, and the button fills
that in. Contributing more than the line allocated is an overspend in the ordinary sense — the
money went somewhere and there is that much less to spend — so it comes off available to spend
immediately, consistent with D4 (ADR 0012).

## Consequences

- `goals` and `goal_contributions` are added, with `goal_id` on `plan_lines` and
  `transaction_lines`. `plan_lines_one_target` widens to "exactly one of category, goal, or pool".
- A goal-funded line may be an `expense` or an `income` — a refund of such an expense goes back to
  the goal — but never a transfer: moving money between your own accounts does not spend it, so
  there is nothing for the earmark to pay for. This is a ledger invariant, in `packages/domain`.
- `goal_contributions.transaction_id` and `period_id` are plain references rather than composite
  ones. A composite `ON DELETE SET NULL` would try to null the row's own `workspace_id`, which is
  `NOT NULL`, so the cascade could not run; both columns are provenance, while the link the figures
  are built from (`goal_id`) keeps its composite key.
- A plan row carries the goal's `name`. A category's name is resolved by the client, where a system
  key reads in both languages; a goal's name is the user's own words, which translate to nothing
  and which the Plan page would otherwise need a second request to learn.
- `Money.ceilToMinor()` is added, as the mirror of `floorToMinor()`.
- The dashboard's goal-progress panel is wired to the real goals now rather than in phase 11:
  showing invented figures beside real ones would be worse than showing none.
- **Deferred:** the Savings page still reads `wealth-data.ts`. Its content — savings accounts with
  their rates and real returns — is v1.1 (§8), and its emergency-fund panel is a second view of a
  goal this page now owns properly. Its placeholder labels moved into the `savings` namespace so
  the `goals.*` strings describe only real data.
- **Deferred:** combined goals, with funding sources pointing at accounts and holdings, remain v2.
  Nothing in this schema blocks them.
