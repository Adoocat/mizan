# ADR 0009: Derived balances, ledger invariants and a single currency

- **Status:** Accepted (2026-10-07)
- **Decision:** D7 in `docs/PLAN.md` §22 (confirmed), with the ledger choices phase 4 had to settle
- **Phase:** 4

## Context

Phase 4 builds the ledger every later phase reads from. Four things had to be decided: where a
balance comes from, which transactions are legal, how an account's currency is constrained, and
how an account stops being used.

`docs/PLAN.md` §22 lists **D7 — currency scope in the MVP** as pending, recommending *TRY only,
with currency columns everywhere*. The rest of the plan already assumes it: §7 puts `currency` on
accounts and lines, gives every line a frozen `base_amount`, and defers TCMB rates to phase 14.

## Decision

### A balance is a query, not a column (D7 recommended default confirmed)

`accounts` has **no balance column**. A balance is `sum(transaction_lines.amount)` over the
account's lines, excluding soft-deleted transactions, computed on every read. A stored balance can
disagree with the ledger that produced it; a derived one cannot. SQL does the aggregation and the
domain applies the rules (§16), so `GET /accounts` is two queries regardless of how many accounts
there are.

An **opening balance** is therefore not a field either. What an account holds when it is added is
written as a dated `opening_balance` transaction with one line, in the same database transaction as
the account insert. "The account started with 24,850 TL" and "24,850 TL arrived on this date" are
the same statement, so there is one mechanism rather than two.

Net worth is the signed sum of the accounts flagged `include_in_net_worth`. Card balances are
already negative, so assets-minus-liabilities needs no special case.

### Invariants: in the domain, backed by the database

`checkLedgerTransaction` in `packages/domain` decides whether a movement is legal, returning the
first violation rather than throwing, so the service can map it to a message. The rules:

| Kind | Rule |
|---|---|
| `expense` | one account, every line negative |
| `income` | one account, every line positive |
| `transfer` | exactly two lines, two different accounts, netting to zero |
| `adjustment` | exactly one line, either sign |
| `opening_balance` | exactly one line, either sign |
| all | at least one line, no line of zero, one currency throughout |

**A refund is `income` in the expense's own category**, not a positive line on an expense. That
keeps every expense single-signed, so "what did this cost" never depends on reading the signs of
its parts. Phase 6's budget-usage arithmetic nets the two as §16 describes.

Two of these are also enforced below the service, where no code path can skip them: the composite
foreign key `transaction_lines (account_id, workspace_id, currency) → accounts (id, workspace_id,
currency)` makes a line pointing at another workspace's account, or disagreeing with its account's
currency, impossible; and a check constraint rejects an amount of zero.

Three invariants deliberately live elsewhere. That a line's account exists is the foreign key's
job. That an on-budget expense carries a category belongs to phase 5, when categories exist. That
the period is open belongs to phase 10.

**At most one opening balance per account** cannot be an index — the account is on the line while
the type is on the header, and a Postgres index predicate may not contain a subquery. It holds
structurally instead: the only code that writes one is account creation. An integration test
asserts the API exposes no second route to one.

### Every account is in the base currency

An account's currency is the workspace's base currency; the API rejects anything else. The columns
are all present — `accounts.currency`, `transaction_lines.currency`, `base_amount`, `fx_rate` — and
`base_amount` equals `amount` with a null rate, so phase 14 adds rates without a schema change.

The consequence runs the other way too: the workspace base currency can only change while the
workspace has **no accounts**, because balances and the frozen base amounts on lines are
denominated in it. Changing it later would silently restate history.

### Reconciling writes one adjustment

The user types the balance their statement shows; `reconcileAdjustment(derived, statement)` returns
the difference, and that single `adjustment` transaction is written. A zero difference writes
nothing, which makes reconciling twice to the same figure a no-op rather than a pair of cancelling
rows. The web app previews the difference with the same domain function, but the API stays
authoritative — it recomputes the derived balance inside the write transaction, so a movement
recorded between opening the dialog and confirming it cannot be lost.

### Archive, never delete

Accounts are archived (`archived_at`). An archived account leaves the list, keeps every line, and
still counts towards the periods it was part of. Transactions are soft-deleted (`deleted_at`),
which is what makes phase 5's undo possible, and balance queries exclude them.

## Consequences

- Balance reads cost an aggregate query. The indexes in §7 cover it
  (`transaction_lines (workspace_id, account_id, date)`), and §7's own guidance is to add a cache
  only if measurements demand one.
- The account detail view shows a capped list of recent movements. Phase 5 replaces it with the
  real transaction table; the endpoint's `entries` field exists so the view is not empty until then.
- `transactions.status` and `source` carry only the MVP values. Phase 9 (recurring) and phase 13
  (import) widen the check constraints along with the columns that link a transaction to a rule or
  a batch, as does `category_id` in phase 5 and `goal_id` in phase 8.
- The mockup's Accounts page is an open-banking screen: read-only consent, per-account sync times,
  "Access expired". None of that is in the MVP, so the page shows what the MVP has — grouped
  accounts, derived balances, net worth — and the sidebar count that stood for an expired consent
  is gone.
