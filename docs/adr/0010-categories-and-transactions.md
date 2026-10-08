# ADR 0010: Categories, splits, Turkish-aware search and taksit

- **Status:** Accepted (2026-10-08)
- **Decision:** D5 in `docs/PLAN.md` §22 (now confirmed), with the category choices phase 5 had to
  settle
- **Phase:** 5

## Context

Phase 5 adds the two things every later phase reads: categories, which the plan allocates to, and
transactions, which measure reality against it. Four questions had to be answered before the code
could be written.

`docs/PLAN.md` §22 listed **D5 — credit card installments** as pending, recommending that the MVP
record the full amount on the purchase date and leave installment budgeting to v1.1. The other
three are not in §22 at all, because they only become questions once categories exist.

## Decision

### D5: a taksit purchase is one transaction on the purchase date

A 12 × 500 TL installment purchase is recorded as a single 6,000 TL expense dated the day it was
bought. The card balance is right immediately, which is what the Accounts page and net worth need.

What it does **not** do is spread the obligation across the twelve plan periods that will actually
pay for it, so a month containing a large taksit purchase looks worse than it is, and the eleven
months that follow look better. Phase 17 adds installment plans and the schedule the plan reads
from; §22 keeps the option of pulling that forward after phase 9 if it turns out to be central to
how the app is used.

The alternative — modelling the schedule now — would have put a second, parallel notion of "money
committed but not yet paid" into phase 5, before the plan that has to read it exists (phase 6) and
before recurring rules (phase 9), which is where the schedule naturally belongs.

### Categories are seeded with the workspace, not with onboarding

`createPersonalWorkspace` seeds the default template inside the same transaction that creates the
workspace and its membership. A workspace therefore never exists without categories, and
`0005_seed_categories.sql` backfills the ones that predate this phase.

The alternative was an explicit "start from the defaults" step in onboarding (phase 11). It was
rejected because every screen that records money needs somewhere to put it from the first
sign-in: quick add is reachable from the shell on every page, and an on-budget expense requires a
category. Seeding at creation means there is no state in which the app is signed in and unable to
record a transaction. Onboarding will still be free to rename, regroup and add to the template —
it calls the same endpoints the Settings screen does.

The template itself is short on purpose: six groups, 22 categories, chosen for a household in
Türkiye (rent and utilities rather than a mortgage; card and loan repayment as their own group,
because consumer credit and taksit are everywhere; one savings and one investment category so
money leaving the budget always has somewhere to land). A list nobody can face editing is worse
than one with a few gaps.

### A seeded category's name is translated; a renamed one is not

The structure of the template — which groups exist, their kinds, their order — is domain data in
`packages/domain/src/categories.ts`. Each entry carries a `system_key`, and the UI renders a
seeded category's name from i18next by that key, so "Food & groceries" reads "Market" in Turkish
from one stored row.

The row still holds an English name, because something has to be in the column for exports, for
API responses and for anyone reading the database. The moment the user renames a category,
`name_overridden` is set and **their** name wins in both languages — it is theirs, and silently
translating it away would be wrong. The `system_key` survives a rename, so the plan can still
recognize the category it needs (phase 8's emergency fund reads the essential groups, phase 9's
prefill reads the keys).

A category the user creates has no key and always shows its stored name. This keeps the
"every user-visible string goes through i18next" rule (ADR 0002) intact for the strings Mizan
chose, without pretending to own the strings the user chose.

### Search folds to ASCII rather than casing per language

`MİGROS` lower-cases to `mi̇gros` in JavaScript — an `i` with a combining dot — while `I`
lower-cases to `i` where Turkish wants `ı`. Searching for "migros" has to find all of them, so
`normalizeSearchText` folds everything to plain ASCII letters: `ı`, `İ`, `î` and `i` all become
`i`, `ş` becomes `s`, `ğ` becomes `g`.

That rule lives in the domain, once. Each transaction stores the folded form of its payee, notes
and memos in `transactions.search_text`, so the database only ever matches a folded query as a
substring against a GIN trigram index (`pg_trgm`). Writing the normalization a second time in SQL
— as an expression index over `unaccent(lower(payee))` — was rejected because the two copies would
drift, and because Postgres's `unaccent` does not fold dotless `ı` at all.

The same function filters the category picker in the browser, so typing `ogrenci` finds
"Öğrenci indirimi" there too, with no round trip.

### One write shape: magnitudes in, signs applied by the API

The API takes an expense of `1600`, not `-1600`, and the kind of transaction decides the sign. A
split is `parts: [...]` on one account; a transfer is one `amount` between two. The ledger
invariants (ADR 0009) then run over the lines the service built.

This is one fewer thing a caller can get wrong, and it means quick add, an edit and a later
importer all agree on what an expense looks like. An **edit replaces** the transaction rather than
patching it: the lines of a split have no identity a client could address, so replacing them
wholesale is the only way an edit cannot leave half a split behind.

### Categories on a transfer

Phase 5 is where §10's rule becomes code. A transfer between two on-budget accounts carries no
category — the money is still inside the budget, and a category would count spending that never
happened. A transfer that leaves the budget (to an investment or loan account) **must** carry one
on the on-budget side, because that is the moment the plan sees the money go. Both are enforced by
`checkLedgerTransaction`, which now takes each line's `on_budget` flag.

## Consequences

- `transaction_lines.category_id` is nullable, and correctly so: an opening balance, a
  reconciliation adjustment and both legs of an in-budget transfer have no category. "Needs
  review" therefore means *an on-budget line of an expense or income with no category*, not simply
  a null.
- Categories are archived and merged, never deleted. A merge moves every line to the target and
  archives the source, so a duplicate can be cleaned up without losing the history that pointed
  at it. Archiving a parent takes its subcategories with it.
- An archived category is refused on a new transaction with the same 404 as a category from
  another workspace: neither may be assigned to new spending, and the status code must not
  confirm that an id exists.
- `search_text` is written on every create and edit. A transaction imported in phase 13 will have
  to be written through the same path, or it will be unsearchable.
- `pg_trgm` is now required. It ships with the official Postgres images and the migration creates
  it, but a managed database that forbids extensions would need the index dropped and the search
  left as a sequential scan.
- The transaction list pages by cursor (`date|id`), not offset: new transactions arrive at the top
  constantly, and an offset would skip or repeat rows underneath them. The summary tiles are
  computed over the whole filtered set rather than the page, so what they say always describes
  what the filters select.
- A page listing transactions holds several database connections while it loads — the page and its
  totals run side by side, and the accounts and categories it needs are their own requests. The
  pool size is now configurable (`DATABASE_POOL_MAX`, default 10); the default was enough for
  phase 4 and is not obviously enough for a browser-heavy screen, so it is worth measuring before
  the private beta.
