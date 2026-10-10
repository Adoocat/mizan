# ADR 0011: The monthly plan — periods, income, lines and the pool

- **Status:** Accepted (2026-10-10)
- **Decision:** the plan choices phase 6 had to settle; none of them were pending in
  `docs/PLAN.md` §22, because they only become questions once there is a plan to read
- **Phase:** 6

## Context

Phase 6 turns `docs/PLAN.md` §10 — the financial rules — into code: plan periods, the income a
month is planned against, allocations to categories and the pool, and the three numbers the Plan
page is judged by (income, allocated, unassigned). §10 defines the arithmetic. It leaves open six
questions that only appear when the rules meet real rows, and the answers shape the API and the
screen.

## Decision

### A period row is written on first use, not in advance

`plan_periods` stores its own `start_date` and `end_date`, and a row exists only once something
has been planned in that month. Until then `GET /plans/:start` serves the month from bounds
computed from the workspace's `period_start_day`, with no lines, an `id` of null, and whatever
spending the ledger already holds for those dates.

Two reasons. A workspace that never opens the Plan page should not accumulate rows for every month
that passes. And the anchor can move: someone who shifts payday from the 1st to the 15th must keep
the months they already planned exactly as they planned them, which only stored bounds can
guarantee. A month that has a row is therefore read from the row; a month that has none is derived
from the current anchor and must line up with it, so `/plans/2026-10-17` is a 400 rather than a
one-day budget.

### Income counts the expectation until the money overtakes it

§10 says an income item counts its expected amount "until marked received", then its actual. What
"marked received" means in a month where money arrives in parts had to be pinned down. Per income
category:

```
counted = received + max(expected, actual − received)
```

`received` is the sum of the items the user has confirmed, with the amount they confirmed;
`expected` is the sum of the ones they have not; `actual` is what the ledger recorded in that
category this period. Confirmed items are held out of the comparison so their own transaction
cannot be counted a second time.

That one line covers every case in flow F2. Half the salary is in and nothing is confirmed: the
plan keeps expecting the whole thing rather than panicking. ₺53,500 arrives against ₺50,000
expected: the arrival wins and ₺3,500 is there to assign. ₺48,000 arrives and the user confirms
it: income drops to ₺48,000 and the plan reads as over-allocated, which is the point. A category
with no item at all has `expected` of zero, so everything in it is unplanned income.

`plan_income_items` therefore has a `received_amount` column, which §7's sketch did not: the
confirmed figure has to be stored, because "what arrived" and "what the user accepted as having
arrived" are not the same number, and only the second one may change the plan.

### Every lira of spending is counted exactly once

The read model's one rule. A row *answers for itself* when it has a line of its own; otherwise
something covers it, and the coverage — not the row — is what totals count:

| Row | Covered by | Where its spending counts |
|---|---|---|
| Any category with a line | — | itself |
| Flexible category, no line | the pool | the pool line (§10: "the pool covers every flexible category without its own line") |
| Subcategory, no line | its parent | the parent's line (§10: "incl. subcategories") |
| On-budget spending with no category | the pool | the pool line |
| Essential, debt, savings or investment category, no line | — | itself, as an overspend the plan never accounted for |

A covered row reports `available` and `overspend` of zero and still reports its own `actual`,
because "where did the pool go?" is exactly the question it answers. Group and plan totals add up
only the rows with `coveredBy: null`, which is what keeps `summary.spent` equal to the month's
on-budget spending however the lines are arranged.

The last row of the table is deliberate: an unplanned essential is not quietly absorbed. §10 pools
only flexible spending, and a ₺3,000 insurance bill with no line should be visible, not invisible.

### An allocation of zero removes the line

`PUT /plans/:start/lines` addresses a line by its **target** (a category, or the pool) rather than
by its id, so typing into a row is one request whether or not the row has a line yet. Clearing the
amount deletes the line instead of storing a zero.

This is what makes the pool work the way a user expects. A flexible category with a zero line has
a line — so its spending is unplanned, and every lira of it reads as an overspend. The same
category with *no* line is covered by the pool, which is what clearing the field means. The Plan
page therefore shows a pooled row as "from pool" rather than as an amount, and a button on it
gives the category a line of its own.

### The plan is read as a whole, and written one line at a time

Every write — an allocation, an income item, a copy — answers with the entire month: period,
summary, groups, rows, income items. The web app puts that straight into the query cache, so the
tiles, the allocation bar and every remainder move together, with no refetch in between that could
show the page half-updated. A plan is a few dozen rows; the round trip costs less than the
inconsistency would.

Lines carry a `version` that is bumped on every edit and may be passed back on a write. With two
tabs open on the same month the second one is told its amount is stale (409) instead of silently
overwriting the first.

### Inline editing previews with the domain, and saves on blur

The amount is typed into the row. While it is being typed, allocated, left-to-allocate, the
allocation bar and that row's remainder are recomputed in the browser with the same
`packages/domain` functions the API calls — `planLineAvailable`, `unassigned`, `budgetStatus` — so
the preview cannot disagree with the saved answer (§16: "the UI only formats, calling domain
functions only for live previews"). Leaving the field saves it; Escape puts the stored amount
back.

## Consequences

- `plan_lines` has `category_id` and `is_pool`, with a check constraint that exactly one of them
  is set. Phase 8 widens it to include `goal_id`; until then `target: "goal"` is refused by the
  contract, and a savings allocation is a line on a savings category.
- `carry_in` exists on every line and is always zero: phase 10 fills it when a period closes.
  `plan_moves` (phase 7) and `carry_overs` (phase 10) are not in this migration, and
  `planLineBudget` already takes `movesIn`/`movesOut` so adding them changes no signatures.
- §10's `U = I + pool carry-in − A` is implemented literally, which means a pool carry-in appears
  both in unassigned and in the pool line's own remainder. It is zero until phase 10; whether the
  surplus should land in income (as the mockup's "Move to this month" implies) or in the pool's
  carry-in is phase 10's decision to make.
- Plan actuals count `expense`, `income` and `transfer` lines on on-budget accounts only. An
  opening balance is not spending and a reconciliation is a correction, so neither may land on a
  plan line; an in-budget transfer's two legs cancel out, and one leaving the budget carries a
  category on the on-budget leg, which is the spending the plan should see.
- A refund arrives as income in a spending category, so it reduces that line's actual rather than
  inflating income — which is why the repository returns one plain signed sum per category and
  lets the domain decide what the sign means.
- Copying a month writes only the lines the target is missing, and income items only into a month
  that has none. Running it twice is a no-op, and it can never overwrite an amount the user typed.
  Expected dates move by their offset from the period's start, so payday stays payday.
- `GET /plans/current` and `GET /plans/:start` resolve the caller's own workspace, so they are in
  the cross-tenant suite for the session requirement only. Every write carries an id and answers
  404 across workspaces.
- **Deferred.** The Plan mockup's "Changes from September" panel needs the previous period's lines
  side by side with this one's, and "When October closes" is the month-review projection; both
  belong to phase 10, and the panel that showed invented numbers is gone until then. The 50/30/20
  allocation mix is wired to the real groups. Rollover flags are stored and shown but have no
  effect until a period closes.
