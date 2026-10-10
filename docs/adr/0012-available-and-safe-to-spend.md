# ADR 0012: Available to spend, the daily allowance, and covering an overspend

- **Status:** Accepted (2026-10-10)
- **Decision:** **D4** in `docs/PLAN.md` §22, now confirmed, plus the choices phase 7 had to settle
  around it
- **Phase:** 7

## Context

Phase 7 produces the number the whole app exists for: *how much can I safely spend today?* §10
gives the arithmetic —

```
ATS         = Available(pool) − Σ uncovered Overspend(L) + min(0, U)
safe today  = max(0, ATS excluding today's spending) ÷ days left including today
```

— and leaves **D4** open: whether an uncovered overspend should reduce what can be spent
immediately, or only once the user presses **Cover**. The Dashboard mockup shows the second; §22
recommended the first. Everything else in this phase follows from that answer.

## Decision

### D4: an overspend reduces what can be spent immediately

Confirmed as recommended: **conservative**. The moment a category goes past its line, the
overspend comes off available to spend. Pressing Cover does not make the number fall — it records
*which line paid for it*.

The alternative leaves the figure optimistic by exactly the amount already overspent, for as long
as the user does not act. That is the one direction a spending figure must never be wrong in: a
number that says ₺3,000 when ₺2,890 is the truth invites the overspend to be spent twice. The
mockup is to be updated rather than followed here.

What the decision costs is that the figure can fall without the user doing anything, so the phase
pairs it with two things: the API sends every term of the subtraction, not just its answer, and
the panel carries an `ExplainPopover` that shows the arithmetic including the overspend line. §14
already called "how this is calculated" a product principle; D4 is what makes it mandatory.

### Covering is a move, not money

A cover is a `plan_moves` row: an amount, the line it came from, the line it went to. The covered
line's budget rises and the source line's falls, so `Allocated` never changes and the plan still
adds up. Three consequences fall out of that, and all three are what a user would expect:

- Covering **from another category** puts the money back into what can be spent — it was
  allocated to something that turned out not to need it.
- Covering **from the pool** changes nothing overall: the overspend goes and the pool shrinks by
  the same amount. The dialog therefore offers real lines first and the pool last.
- A cover can only move money that exists. The source must have the amount spare, and a cover may
  not exceed the overspend, or the plan would be claiming to have solved an overspend with money
  that is itself already spent.

Both ends are named by their **target** (a category, or the pool) rather than by a line id,
because an unplanned category has an overspend and no line to receive the money; the service opens
one at zero, which is the truth about it. A line a cover points at cannot then be cleared — undoing
the cover is a decision, so it is the user's to make first.

`§7`'s sketch had `from_line_id` and `to_line_id` nullable. They are both `NOT NULL` here, and
must differ: a cover with one end would be money appearing from nowhere, which is the thing this
table exists to prevent.

### The allowance is set at the start of the day and spent down

`safe today` divides what was available **at the start of today**, not what is available now. The
figure is therefore steady through the day — ₺300 a day, with ₺85 spent and ₺215 left — rather
than shrinking with every expense, which would make it impossible to plan a day around. Anything
unspent is simply part of tomorrow's figure, because the division runs again over one day fewer.

`spentToday` is the *difference between the two figures* rather than a sum of today's expenses, so
it counts everything today did to the number: pooled spending, an overspend created today, a
transfer that left the budget. A day that brought money in shows nothing spent and more left. One
SQL query returns both sums — the whole period, and everything dated before today — so the two can
never be read from different states of the ledger.

The division rounds **down** (`Money.floorToMinor`). ₺1,000 over seven days is ₺142.857…, and
half-up would make it ₺142.86 — seven of which come to ₺1,000.02. A daily allowance may not
promise more than there is.

### Money waiting to be assigned is not spending money

`min(0, U)` means only a *negative* unassigned figure touches the number: a plan that promises
more than the month will bring cannot also offer the difference. Money still waiting for a job is
not added either — giving it one is the user's decision, not the app's. A workspace that has
allocated a pool but recorded no income therefore has nothing safe to spend, which surprised the
integration tests before it surprised anyone else, and is right.

### The preview in quick add is the same arithmetic

`BudgetImpactPreview` shows what an expense would do before it is saved — "Food & groceries ₺1,150
→ ₺650 · today's allowance ₺604 → ₺519" — by running the same `packages/domain` functions over the
plan the page already holds. It resolves the plan for the month the **date** falls in, not the
current one, so a backdated expense previews against the month it would actually change.

How much of an expense comes off the daily figure depends on who answers for the category: all of
it when the pool does, and only the part that goes past the line when the category has one of its
own. That is D4 restated in the one place a user is most likely to meet it.

## Consequences

- `plan_lines` gained `UNIQUE(id, workspace_id)` so `plan_moves` can point at it with a composite
  key. The generated migration put that constraint *after* the foreign keys that need it, which
  Postgres rejects; `0007_plan_moves.sql` is hand-reordered, and a generated migration that adds
  a composite FK target will need the same check.
- Every line's `movesIn` and `movesOut` are in the read model, and `planLineBudget` already
  counted them, so no figure changed shape when covers arrived.
- The plan read model now computes its figures twice — once over the period, once over everything
  before today. It is the same in-memory pass over rows that are already loaded, so the cost is
  arithmetic rather than a second query.
- `buildTestApp` takes a `clock`. Anything that depends on what day it is has to, or the test is
  asserting against the day it happens to run on.
- Safe to spend lives on the **Plan** page for now, with the allowance, the explanation and the
  Cover flow. The Dashboard hero is phase 11's screen and still reads sample data; wiring it there
  is a one-line swap once that phase owns it.
- **Deferred.** `plan_moves.reason` is stored but nothing writes one yet: the dialog records which
  line paid, which is the part the plan needs. A cover is undone whole rather than edited, and
  only the most recent cover on a row is offered an Undo — the full list is in the API's `moves`
  for a later screen.
