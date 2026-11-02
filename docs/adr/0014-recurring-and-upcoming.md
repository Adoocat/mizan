# ADR 0014: Recurring money — virtual occurrences, and what a confirm leaves behind

- **Status:** Accepted (2026-11-02)
- **Decision:** the tail of **D12** in `docs/PLAN.md` §22, plus the choices phase 9 had to settle
  around §11's description
- **Phase:** 9

## Context

§11 settles the shape of the feature: occurrences are **virtual**, expanded on demand by a pure
`expand(rule, exceptions, from, to)`, and future transactions are never pre-inserted. It also
settles the editing model — only this, this and future, entire series — and that auto-posting is
opt-in, fixed-amount and idempotent.

What it did not settle, and what §7's schema sketch left open or contradicted:

1. The sketch gives `recurrence_exceptions` a `transaction_id` and lists `status` on
   `recurring_rules` with no values. Between them, there are three places a posted occurrence
   could be recorded and two places a rule could be "ended".
2. "Pausing/ending: `status = paused` with optional `paused_until`." A pause with only an end has
   no beginning, so there is no way to say what it suppresses.
3. `goal_id` sits on a rule with no statement of what it means, while §9 gives a goal two
   different relationships to a transaction (funded-from, and earmarked-for).
4. `remind_days_before` is in the sketch, with nothing in the MVP to remind anybody.
5. D12 left "rolling `target_date` forward lands with recurring in phase 9" without saying what
   rolls it.

## Decision

### A posted occurrence is a transaction, and nothing else

`transactions` gains `recurring_rule_id` and `occurrence_date`, and that pair **is** the record
that an occurrence is posted. There is no occurrence table and no `posted` exception.

The alternative — an exception row carrying `transaction_id`, as §7 sketched — would have put the
same fact in two places, and the one that is not the ledger would be free to drift. It would also
have made "exactly one transaction per occurrence" a service's judgement; as it is, it is a
partial unique index:

```sql
UNIQUE (workspace_id, recurring_rule_id, occurrence_date)
  WHERE deleted_at IS NULL AND recurring_rule_id IS NOT NULL
```

Partial on `deleted_at IS NULL` deliberately. Confirming is a one-tap action on a number the user
may have misread, so undo has to work: soft-deleting the transaction hands the occurrence back as
due, with nothing to clean up. A row that held the slot after being deleted would make the
occurrence unconfirmable for ever.

`occurrence_date` is the occurrence's **original** date — its series date — never the date the
money moved, which is `transactions.date` and may be later. The identity of an occurrence cannot
depend on when it was settled, or confirming a payment late would turn it into a different one.

The rule reference is plain rather than composite, for the reason `goal_contributions` gives: a
composite `ON DELETE SET NULL` would try to null the row's own `workspace_id`, which is `NOT NULL`,
so the cascade could not run. Deleting a rule therefore leaves its posted transactions standing —
the money moved, whatever became of the prediction.

### Two dates, and only one of them is an identity

The **original date** is the series date: the 1st of the month, come what may. The **due date** is
when the money is actually expected — the original date after the weekend policy, and after any
override. Every URL, exception and posted transaction keys on the original date; every screen,
window filter and total uses the due date.

This is what lets the weekend policy and single-occurrence overrides coexist with a stable
identity. A rule whose policy changes from "next business day" to "previous" does not orphan its
exceptions, and an occurrence moved three weeks later is still the one that was due on the 1st.

### No stored `status` beyond `paused`, and no stored next date

`recurring_rules.status` is `active | paused` only. A rule **ends** through `end_date` (inclusive)
or `max_count`, both of which the series already carries, so `isFinished` derives it. `nextDueDate`
and the rule's monthly cost are derived on every read too.

§7's sketch implied an `ended` state. A column repeating what the dates already say is exactly the
kind of state that drifts out of step with them — the same reason `goals` has no stored status or
progress (ADR 0013).

### A pause has a beginning as well as an end

`paused_from` is added beside `paused_until`, and a pause suppresses the half-open window
`[paused_from, paused_until)`. `paused_from` defaults to the day the user paused.

Without a beginning, pausing the gym in October would also erase the two payments that were
already overdue — and those still happened, or still need resolving. The window is half-open so
that resuming on the 1st means the 1st is back.

### `goal_id` means what the rule's `kind` makes it mean

On an `expense` or `income` rule the occurrence is **funded from** the goal: the transaction line
carries `goal_id`, which is how a sinking fund pays the bill it was saved for. On a `transfer` rule
it **earmarks** for the goal: confirming writes the transfer and the contribution together, in one
database transaction, which is §11's auto-transfer-to-goals and flow F8's second funding route.

Both are relationships the ledger already allows, and ADR 0013's invariant — a goal-funded line is
never a transfer — is what makes the two unambiguous. One column with the kind deciding was
preferred to two columns, three-quarters of which would always be null.

### An on-budget rule needs a category when it is written

The ledger requires a category on an on-budget expense or income (§10). That is now checked when
the rule is saved rather than when an occurrence is confirmed: a rule that cannot be confirmed is
not a rule, and finding out a month later — with the bill due and the Confirm button refusing — is
the worst possible moment to be told.

### Auto-post catches up a fortnight, and no further

The job posts every occurrence due on or before today that is not already posted or skipped,
reaching back at most 14 days. Catching up matters, because the worker may have been down and the
point of auto-post is that the user does not have to notice; bounding it matters, because switching
auto-post on for a rule that started last year must not post a year of history into the ledger at
once. A fortnight is the window the Upcoming list already shows as overdue, so what the job writes
is what the user could already see waiting.

Deliberately **not** bounded by the rule's `created_at` as well, which was tried first: that
instant comes from the database's clock rather than the injected one, and a job that decides what
is due today has to answer to the same clock as everything else (D3).

Idempotence comes from the unique index, not from the job's own bookkeeping: a second run, a
retry, or a user confirming by hand at the same moment all end at the same constraint, and a
unique violation is read as "already done" rather than as an error.

### D12: a repeating sinking fund is rolled forward by the daily job

`rolledTargetDate(targetDate, repeat, today)` advances by whole repeats until the date is no longer
behind today, and the daily worker applies it to every repeating fund. Only the date moves: the
fund keeps what it holds, because the bill was paid out of it and next year's saving starts there.

Each turn is measured from the original date rather than from the last one, so a bill due on the
31st is not quietly demoted to the 30th by one pass through a short month — the same clamping rule
`nthSeriesDate` uses.

A job rather than a derived value, because `target_date` is the user's own field: they can edit it,
and a figure computed over the top of it would overwrite that silently. A bill due **today** is not
rolled — it has not passed yet, and rolling it would hide the thing the user is meant to be paying.

### `remind_days_before` is omitted

There is nothing in the MVP to remind anybody with: no push, no email, no notification settings.
The column would be unused state with no consumer, and the Upcoming list already shows the 7- and
30-day windows the user actually looks at. It comes back with notifications.

### The calendar grid and the lowest-balance figure stay in v1.1

§13 gives the MVP "recurring rules, 7/30-day list with confirm/skip/override" and puts "calendar
grid, projected balance" under Later; §20 puts them in phase 19. The 2.0 mockup's month grid and
its "lowest projected balance" tile both need a day-by-day balance projection, which is that
phase's work.

So the page is the list and the rules behind it, and it is called **Upcoming** rather than
Calendar. A grid whose own legend promises "Paid" while quietly omitting what was paid would be
worse than no grid, and the tile that replaced the lowest-balance one — what the rules commit each
month — is a figure this phase can actually stand behind. The sidebar's hard-coded count of one
overdue payment went with it, for the reason Accounts lost its count in phase 4: the page now knows
how many there really are.

## Consequences

- `recurring_rules` and `recurrence_exceptions` are added; `transactions` gains
  `recurring_rule_id`, `occurrence_date` and the partial unique index over them.
- `packages/domain/src/recurrence.ts` holds the whole expansion: `nthSeriesDate`, `seriesIndexOf`,
  `occurrenceAt`, `expandRecurrence`, the weekend policy, `monthlyEquivalent` and
  `occurrencesToAutoPost`. `expandRecurrence` takes one options object rather than §11's four
  positional arguments, and `occurrenceAt` is the single-occurrence lookup a URL resolves to —
  both go through one `buildOccurrence`, so a list of occurrences and a lookup of one can never
  describe the same occurrence differently.
- A window is filtered by **due** date and padded by two days when searching for the original
  dates that could land in it, which is the furthest the weekend policy can move one. An override
  can move an occurrence anywhere, so overrides are collected separately rather than guessed at.
- `plan_lines` gain nothing, but `PlanResponse` gains `uncoveredRecurring`: the rules whose
  category or goal has no line this month. Income rules are left out — expected income is planned
  as income items, and the MVP has no link between a rule and an item to compare. A subcategory
  counts as covered by its parent's line, exactly as its spending is counted there (§10).
- `POST /plans/:start/prefill` sums each rule's occurrences inside the month onto a line for its
  category, and turns income rules into expected-income items. Nothing already there is touched,
  so it is safe to press again after adding a rule.
- pg-boss arrives, and schedules both daily jobs in `Europe/Istanbul`. It is **only** the clock:
  both jobs are plain functions over the database that the integration tests call directly, so what
  runs in production is what the tests cover.
- A "this and future" split inherits no `max_count`: "the next six payments" counted from a start
  that has moved means nothing, so a counted series being split should say how many are left.
- **Found in passing, and fixed:** every month-addressed plan route accepted a date but not
  `current`, so the first edit from the default Plan view — which has no month in its URL yet —
  was refused with a validation error. Phase 6's own tests always addressed a month by date, and
  the web tests' request mocks matched either, so nothing caught it.
- **Deferred:** match suggestions for a similar manual or imported transaction (§11, v1.1), the
  calendar grid and balance projection (phase 19), detection of recurring payments from history
  (v2), and Turkish public holidays in the weekend policy (v2).
