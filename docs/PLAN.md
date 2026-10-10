# Mizan — Master Implementation Plan

> **Status:** Approved as the working plan. Implementation in progress (see the phase tracker).
> **Open items:** D1, D2, D3, D5, D6, D7 and D8 in [§22](#22-decisions) are confirmed; the others are recorded with their recommended defaults and are still **pending confirmation**.
> **Design reference:** the current high-fidelity mockups live in [`design/new-design/`](../design/new-design/) (design system **2.0**, ADR 0006); the 1.0 files at the top of [`design/`](../design/) are superseded. They depict the long-term product; the MVP ships a subset (see §3 and §13).

## Phase tracker

| Phase | Name | Status |
|---|---|---|
| 0 | Project foundation | ✅ |
| 1 | Domain primitives (pure) | ✅ |
| 2 | Design system and app shell | ✅ |
| 3 | Auth, users, workspace | ✅ |
| 4 | Accounts and ledger core | ✅ |
| 5 | Categories and transactions | ✅ |
| 6 | Monthly plan I | ✅ |
| 7 | Available to spend and safe-to-spend | ⬜ |
| 8 | Goals | ⬜ |
| 9 | Recurring and upcoming | ⬜ |
| 10 | Month review and close | ⬜ |
| 11 | Dashboard and onboarding | ⬜ |
| 12 | MVP hardening and release | ⬜ |
| 13–21 | v1.1 (see §20) | ⬜ |

Update this table when a phase is completed (✅) or in progress (🟡).

> **Screens exist before their phases.** Every screen in `design/new-design/` was built at full
> visual fidelity during the 2.0 design revision — including the v1.1 ones — reading placeholder
> data from `apps/web/src/lib/sample-data.ts` and `apps/web/src/lib/wealth-data.ts` (ADR 0007). A phase still owns its screen's behaviour: wiring it to the API, its mutations and
> its domain tests — and deleting its slice of the sample data.

---

## 1. Product Understanding

**What Mizan is:** a personal finance app for people in Türkiye that puts planning first. Its main job is to answer one question every day: *"How much can I safely spend today without hurting my bills, goals or investments?"*

**Value proposition:** when income arrives, every lira gets a job: bills, variable spending, debt, savings, investments, and a pool of money that is free to spend. Every later screen measures reality against that plan.

**How it differs from an expense tracker:**

| Expense tracker | Mizan |
|---|---|
| Looks back: "where did it go?" | Looks forward: "where should it go?" |
| Savings is whatever is left over | Savings and investments are planned before spending |
| Total spent per category | One number, **safe to spend today**, with the math shown |
| Separate tools for budget, goals and portfolio | One flow: income → plan → transactions → goals → portfolio → net worth |
| Prices and returns in nominal TL | Built for Türkiye: inflation and real returns, gold and FX holdings, TEFAS and BIST, installments (*taksit*), a month that starts on payday |

**Design constraint:** apps that rely on manual entry lose users because entering data is tedious. The MVP has to win on three things:

1. A clear plan.
2. Recording an expense in under 10 seconds.
3. Recurring items that remove most of the typing.

---

## 2. Core User Flows

**F1 — Onboarding (goal: the user sees their safe-to-spend number within 5 minutes)**
1. Sign up.
2. Set preferences: base currency (TRY), the day the plan month starts (payday), and language.
3. Add accounts with their current balances. Each balance becomes an *opening balance* transaction.
4. Enter expected monthly income and payday.
5. Enter fixed payments (rent, bills, subscriptions, loan installments). Each becomes a recurring rule.
6. Mizan drafts the first plan automatically: fixed payments go into Essential and Debt, it suggests emergency fund and investment lines, and the rest goes to **Available to spend**.
7. The user sees the plan summary and their safe-to-spend amount.

*Joining mid-month:* the first period runs in "start from today" mode. Mizan plans the spendable money the user has now for the rest of the period instead of a full month's income.

**F2 — Payday:** the expected salary appears as due. The user confirms it with the actual amount, and the plan switches from the expected figure to the actual one. If more arrived than expected (53,500 vs 50,000), Mizan asks where the extra 3,500 should go. If less arrived, the plan shows it as over-allocated. Planned transfers to savings and investments show **"Mark done"**, which records the transfer and the goal contribution.

**F3 — Planning a new month:** copy last month's plan, prefill it from recurring rules, adjust amounts, bring "Left to allocate" to zero, and check the allocation mix.

**F4 — Recording an expense (the most frequent action):** quick add takes an amount, category, account, date (defaults to today) and payee. Before saving it shows the budget impact, for example *"Dining out pool 3,000 → 2,915 · today's allowance 215 → 130"*. The user can optionally split the amount across categories or fund it from a goal.

**F5 — Tracking the budget during the month:** the Plan page shows progress for each line. The dashboard's **Needs attention** list shows overspending and overdue bills, and the user can cover an overspend from another line.

**F6 — Upcoming payments:** the next 7 or 30 days. The user can confirm a payment (enter the actual amount, which creates the transaction), skip it, or edit that one occurrence. Unconfirmed past-due payments show as overdue.

**F7 — Creating a goal:** emergency fund (1, 3 or 6 months of essentials), savings goal, or sinking fund. Mizan calculates the required monthly amount, and **"Add to plan"** creates a plan line.

**F8 — Contributing to a goal:** a plan line is marked done, or the user adds a manual contribution or links a transfer. Goal progress updates.

**F9 — Month review and close:**
1. Summary: income, spending, saved, invested, savings rate, largest deviations.
2. Leftovers in each category: roll over, move to a goal, move to investments, or return to the pool.
3. Overspending is resolved.
4. The next period opens with the carried-in amounts.

**F10 (v1.1) — Adding an investment:** choose an account and an asset, then record a BUY (quantity, price, fee, date, funding account). The holding and portfolio recalculate. *Opening positions* ("I hold 180 THYAO at an average cost of 276") are essential, because nobody will type in years of trade history.

**F11 (v1.1) — Viewing the portfolio:** value, cost, P&L, allocation and dividends.

**F12 (v1.1) — CSV import:** upload, detect encoding and format, map columns, preview with duplicates flagged, categorize, commit.

---

## 3. MVP Definition

**MVP theme: the plan → spend → review loop for one person in TRY.**

| Feature | MVP | v1.1 | v2 | Long-term |
|---|:-:|:-:|:-:|:-:|
| Email/password auth, personal workspace | ✅ | 2FA | | |
| Manual accounts: cash, checking, savings, credit card | ✅ | | | |
| Loans and other liabilities, manual assets (car, house) | | ✅ | | |
| Categories with groups and an essential flag | ✅ | | | |
| Transactions: expense, income, transfer, splits, notes | ✅ | tags, payee rules | | attachments |
| Monthly plan, pool, unassigned, copy, rollover flag | ✅ | | | |
| Safe to spend today | ✅ | | | |
| Recurring rules, upcoming list, confirm/skip/edit | ✅ | match suggestions | detection from history | |
| Goals: emergency fund, savings, sinking funds (tracked) | ✅ | | combined goals (multiple sources) | |
| Month review and close | ✅ | review archive | | |
| Dashboard (core widgets) | ✅ | net worth and portfolio widgets | | |
| Data export (JSON/CSV), account deletion | ✅ | | | |
| CSV import (Turkish bank formats) | | ✅ | | |
| Multiple currencies with TCMB rates | | ✅ | | |
| Investments: manual, average cost, P&L, allocation, dividends | | ✅ | | |
| Price feeds (FX, gold, crypto, TEFAS; BIST and US where licensable) | | ✅ | | |
| Credit card installments (*taksit*) | | ✅ | | |
| Net worth with monthly snapshots | | ✅ | real-terms view, change attribution | |
| Calendar month view and simple 30-day balance projection | | ✅ | full forecast (90 days / 6 months) | |
| Reports v1 | | ✅ | year-over-year, deeper analytics | |
| Target allocation, rebalancing hints, DCA plan | | | ✅ | |
| Time-weighted and money-weighted returns, benchmarks, real return vs CPI | | | ✅ | |
| What-if simulator | | | ✅ | |
| Debt payoff simulator (avalanche/snowball) | | | ✅ | |
| Allocation rules engine | | | ✅ | |
| Financial health score (explainable) | | | ✅ | |
| Notifications, installable PWA | | | ✅ | |
| AI assistant | | | | ✅ |
| Shared/household finances | | | | ✅ |
| Open banking and brokerage connections | | | | ✅ |
| Receipt scanning, native mobile app | | | | ✅ |

**Why this order:**
- **Priorities 1–6 are the MVP**, and together they make one closed loop. The plan needs transactions to measure against, safe-to-spend needs the plan, and goals give the savings lines somewhere to go.
- **Investments wait for v1.1.** They pull in prices, multiple currencies, corporate actions and cost basis, the riskiest subsystem. In the MVP an "Investments" plan line captures *planning* to invest; *tracking* the portfolio comes next.
- **CSV import is the first item after the MVP.** Turkish bank exports vary a lot (Windows-1254 encoding, decimal commas, `dd.MM.yyyy` dates). It needs its own phase and a stable ledger.
- **Net worth history needs prices and liabilities** to mean anything. The MVP shows a single "assets minus liabilities" number on the Accounts page.
- **Health score, what-if and AI assistant only work on correct data.** Shipping them early produces confident-looking wrong numbers.

**Changes to the original requirements:**
- **Savings and Goals are one section.** Emergency fund, savings goals and sinking funds are all goals; "combined" is a funding detail.
- **"Income" is not its own entity.** It is income transactions + expected-income plan items + recurring rules.
- **Debts are liability accounts** with loan terms attached.
- **Holdings are calculated from investment events**, never edited by hand.
- **The allocation rules engine waits for v2.** "Copy last month" + recurring prefill covers most of its value.
- **The financial health score stays out until it can be fully explained.**

---

## 4. Application Architecture

**A modular monolith:** one API codebase running as two processes (HTTP and background worker), one Postgres database, and a React single-page app. No microservices, no Redis, no message broker until a measured need appears.

```
┌──────────────────┐   HTTPS/JSON, httpOnly session cookie   ┌───────────────────────────────┐
│  React SPA (web)  │ ─────────────────────────────────────▶ │  API (Fastify, modular)        │
│  TanStack Query   │                                         │  routes → services → repos     │
│  imports @domain  │                                         │  imports @domain (pure calc)   │
└──────────────────┘                                         └──────────────┬────────────────┘
                                                                             │ SQL (Drizzle)
                       ┌──────────────────────────┐                ┌────────▼─────────┐
                       │ Worker (same codebase)    │ ─────────────▶ │  PostgreSQL       │
                       │ pg-boss: recurring, close,│                │  (+ pg-boss queue)│
                       │ snapshots, price/FX fetch │                └──────────────────┘
                       └────────────┬─────────────┘
                                    │ provider adapters (v1.1+)
                              TCMB · TEFAS · crypto · gold · equities
```

- **Frontend:** an SPA (everything is behind login; SSR adds nothing). Responsive, with mobile layouts following the Mobile mockup ("the phone is for checking and capturing").
- **Backend:** each module (`accounts`, `ledger`, `plan`, `goals`, `recurring`, …) has:
  - **routes:** HTTP handling and validation
  - **services:** use cases, database transactions, workspace scoping
  - **repositories:** queries

  Financial rules live in the pure `domain` package (no I/O), shared by API and SPA. The API is always authoritative; the SPA uses the same functions only for live previews.
- **Database:** PostgreSQL is the only data store, including the job queue.
- **Authentication:** server-side sessions in Postgres with an httpOnly cookie. No JWTs in localStorage.
- **API:** REST + JSON under `/api/v1`; OpenAPI generated from the shared Zod contracts (the future AI assistant will use the same API as tools).
- **State management:** server state in TanStack Query, local UI state in React. No Redux. Cache invalidation defined centrally (e.g., a new transaction invalidates accounts, plan, goals, dashboard).
- **Validation:** shared Zod schemas at the browser edge and API edge, plus domain invariants.
- **Background jobs:** pg-boss. MVP: daily auto-post of opted-in recurring items, auto-close of forgotten periods, reminders. Later: price/FX fetching, snapshots.
- **Caching:** none server-side in the MVP. Financial responses use `Cache-Control: no-store`. Prices/FX stored in tables; providers never called on the request path.
- **Imports (v1.1):** size-limited uploads parsed in a streaming fashion into staging rows; raw files not kept. Attachments (later) go to S3-compatible storage with signed URLs.
- **Market data:** fetched only by the worker through provider adapters, written to tables.
- **Deployment:** Docker images for API and worker, SPA as static files, managed Postgres with point-in-time recovery, one region.

---

## 5. Technology Stack

| Area | Choice | Why | Alternatives | Tradeoffs |
|---|---|---|---|---|
| Language | **TypeScript (strict) end to end** | One language; domain logic shared by UI previews and server | Python (FastAPI) backend | Domain code would be duplicated; contracts drift |
| Monorepo | **pnpm workspaces** (+ Turborepo if builds slow) | Simple, fast, strict deps | Nx | Heavy for a single developer |
| Frontend | **React + Vite SPA** | Fast dev, large ecosystem, no SSR overhead | Next.js, SvelteKit | Next's RSC/caching complexity unneeded; Svelte has a smaller ecosystem |
| Routing | **TanStack Router** | Type-safe search params (transaction filters in the URL) | React Router | — |
| Server state | **TanStack Query** | Caching, invalidation, optimistic quick-add | SWR, RTK Query | — |
| Forms | **React Hook Form + Zod** | Performant, uses shared schemas | TanStack Form | — |
| UI | **Tailwind CSS + shadcn/ui (Radix)** | We own the components; maps to the design's `--m-*` tokens; accessible | Mantine, MUI | Harder to match the bespoke design |
| Charts | **visx** (d3-scale/shape) | Designs are custom minimal SVG charts | Recharts, ECharts | Recharts fights custom styling; ECharts is heavy |
| Backend | **Node 24 LTS + Fastify** | Mature, fast, first-party plugins, Zod type provider | Hono, NestJS, Express | NestJS is enterprise weight |
| ORM | **Drizzle** | SQL-first, explicit migrations, `numeric` as string, composite FKs, partial indexes | Prisma, Kysely | Less SQL control in Prisma |
| Database | **PostgreSQL 18** (17 if host lacks 18) | Exact `NUMERIC`, transactions, partial indexes, native `uuidv7()` | MySQL, SQLite | SQLite has no true decimal type |
| Decimal math | **decimal.js** | Exact arithmetic, rounding modes, non-integer powers | big.js, bigint minor units | — |
| Dates | **`YYYY-MM-DD` plain-date strings + date-fns** | Business dates are calendar dates, not instants | Day.js, Luxon, Temporal | — |
| Validation | **Zod** | Shared contracts, OpenAPI generation | Valibot | — |
| Auth | **Better Auth** (self-hosted, Drizzle adapter, sessions, TOTP plugin) | Data stays in our DB (KVKK), 2FA path built in | Hand-rolled sessions, Clerk/Auth0 | Managed providers send identity data to a third party |
| Jobs | **pg-boss** | Uses Postgres; no Redis | BullMQ + Redis | Another service to run |
| Logging | **pino**; Sentry later with PII scrubbing | Structured, fast | — | — |
| i18n | **i18next + `Intl`** | TR/EN, ICU plurals, locale formatting | FormatJS | — |
| Testing | **Vitest, fast-check, Testing Library, MSW, Playwright, Testcontainers** | See §18 | Jest, Cypress | — |
| Deployment | **Docker + managed platform** (Fly.io/Render/Railway) **+ managed Postgres with PITR** | Low ops | VPS + Coolify/Kamal | Cheaper, but we own backups and patching |

---

## 6. Domain Model

**Identity and tenancy**

| Entity | Responsibility | Key fields | Relationships |
|---|---|---|---|
| User | Login identity | email, name, locale, timezone (`Europe/Istanbul`) | has many Memberships |
| Workspace | Owner of all financial data ("Personal ▾" in the mockup) | name, base_currency, period_start_day, timezone | Members, Accounts, Categories, … |
| Membership | User ↔ workspace | role (owner/editor/viewer) | — |
| Session | Auth session | token hash, expires_at, user agent | User |

**Ledger (source of truth for money)**

| Entity | Responsibility | Key fields | Relationships |
|---|---|---|---|
| Account | Where value lives: cash, checking, savings, credit card; later investment, loan, manual asset | type, currency, on_budget, include_in_net_worth, archived_at | Lines; LoanTerms (1:1, v1.1) |
| Transaction | A financial event (header) | type (expense, income, transfer, adjustment, opening_balance, investment), date, payee, notes, status, source, recurring link | 1..n Lines |
| TransactionLine | One signed movement on one account, optionally categorized | account, category, amount, currency, base_amount, fx_rate, goal (if goal-funded), memo | Account, Category, Goal |
| CategoryGroup | Plan grouping | kind: income, essential, flexible, debt, savings, investment | Categories |
| Category | Classification (two levels) | name, group, parent, is_essential, system_key, archived_at | Lines, PlanLines |

*Splits* = several lines on the same account with different categories. *Transfers* = two lines on different accounts. One structure covers splits, transfers and cross-currency transfers.

**Planning**

| Entity | Responsibility | Key fields | Relationships |
|---|---|---|---|
| PlanPeriod | One budget month anchored to payday | start_date, end_date, status (open/closed), closed_at | IncomeItems, PlanLines |
| PlanIncomeItem | Expected income | income category, expected_amount, expected_date, received_at, recurring_rule | Period |
| PlanLine | An allocation | target: a category **or** a goal **or** the pool; planned_amount, carry_in, rollover flag | Period, Category/Goal |
| PlanMove | Money reassigned between lines ("cover overspend") | from_line, to_line, amount, reason | Period |
| CarryOver | Decision made at close | from line, action (rollover, to_goal, to_investment, to_pool), amount | Period, Goal |

**Scheduling**

| Entity | Responsibility | Key fields | Relationships |
|---|---|---|---|
| RecurringRule | Repeating money template | kind, amount, amount_mode (fixed/estimated), schedule, start/end, status, auto_post, series_id | Account(s), Category, Goal |
| RecurrenceException | Override for one occurrence | original_date, action (posted/skipped/modified), override date/amount, transaction | Rule |

**Goals**

| Entity | Responsibility | Key fields | Relationships |
|---|---|---|---|
| Goal | A purpose with a target | type (emergency_fund, savings, sinking_fund), target, target_date, priority, kept_in_account, emergency_months, repeat | Contributions, PlanLines |
| GoalContribution | Earmarking/releasing money for a goal | date, amount (±), source, linked transaction, period | Goal |
| GoalFundingSource *(v2)* | Links a goal to an account or holding | source type/id, allocation mode (whole, fixed, percent, quantity) | Goal, Account/Holding |

**Later contexts**
- **Investments (v1.1):** Asset, AssetPrice, InvestmentEvent, Holding (projection), PortfolioValuation — see §8.
- **Liabilities (v1.1):** LoanTerms, InstallmentPlan.
- **Market data:** FxRate, EconomicSeries (CPI).
- **Snapshots:** NetWorthSnapshot.
- **Import:** ImportBatch, ImportRow, ImportProfile.
- **Audit:** AuditEvent.

**Merged or removed from the original list:** `Income` → transactions + PlanIncomeItem + RecurringRule; `InvestmentAccount` → Account type; `Debt` → liability Account + LoanTerms; `SavingsGoal` + `FinancialGoal` → Goal; `Budget` + `BudgetPeriod` → PlanPeriod + PlanLine; `Holding` → calculated projection.

---

## 7. Database Design (conceptual)

**Conventions**
- **Primary keys:** UUIDv7. Clients may generate them → idempotent creates (no double expenses from a double tap).
- **Every financial table has `workspace_id`**; every query is scoped by it.
- **Business dates** are `DATE`; **instants** are `timestamptz` (UTC).

**Money and currency**
- **Money:** `NUMERIC(20,4)`, always rounded to the currency's minor units (2 for TRY/USD/EUR/GBP) before writing, half-up. User-entered amounts stored exactly as entered.
- **Quantities:** `NUMERIC(30,12)`. **Prices:** `NUMERIC(24,10)`. **FX rates:** `NUMERIC(20,10)`.
- **On the wire:** `{"amount":"12000.00","currency":"TRY"}`. JavaScript `number` is never used for money.
- **Currencies:** `currencies(code CHAR(3) PK, minor_units, symbol)`. Gold and crypto are **assets**, not currencies.
- **Base-currency amounts are frozen** at transaction time (`base_amount`, `fx_rate`) so reports never change when rates move.

**Core tables (MVP)**
```
users(id, email CITEXT UNIQUE, email_verified_at, name, locale, created_at, deleted_at)
sessions / auth_accounts / verifications  -- owned by the auth library
workspaces(id, name, base_currency→currencies, period_start_day 1..28, timezone, created_at)
workspace_members(workspace_id→, user_id→, role)  PK(workspace_id,user_id)

accounts(id, workspace_id→, name, type, currency→, on_budget BOOL, include_in_net_worth BOOL,
         institution, sort_order, archived_at, created_at, updated_at)
         UNIQUE(id, workspace_id, currency)            -- target of a composite FK
category_groups(id, workspace_id→, name, kind, sort_order)
categories(id, workspace_id→, group_id→, parent_id→categories NULL, name, icon, color,
           is_essential, system_key NULL, archived_at)
           UNIQUE(workspace_id, system_key) WHERE system_key IS NOT NULL

transactions(id, workspace_id→, type, date DATE, payee, notes, status, source,
             recurring_rule_id→ NULL, occurrence_date NULL, import_batch_id NULL, import_hash NULL,
             created_by→users, created_at, updated_at, deleted_at)
             UNIQUE(recurring_rule_id, occurrence_date) WHERE deleted_at IS NULL
             UNIQUE(workspace_id, import_hash) WHERE import_hash IS NOT NULL
transaction_lines(id, transaction_id→ ON DELETE CASCADE, workspace_id, account_id, currency,
                  category_id→ NULL, goal_id→ NULL, amount ≠ 0, base_amount, fx_rate NULL,
                  date DATE /*denormalized*/, memo)
                  FK(account_id, workspace_id, currency) → accounts(id, workspace_id, currency)

plan_periods(id, workspace_id→, start_date, end_date, status, closed_at)  UNIQUE(workspace_id,start_date)
plan_income_items(id, period_id→, category_id→, label, expected_amount ≥0, expected_date,
                  received_amount NULL, received_at NULL)   -- confirmed amount, see §10
plan_lines(id, period_id→, category_id NULL, goal_id NULL, is_pool BOOL, planned_amount ≥0,
           carry_in, rollover BOOL, sort_order, version)    -- goal_id joins in phase 8
           CHECK(exactly one of category_id / goal_id / is_pool)
           UNIQUE(period_id, category_id), UNIQUE(period_id, goal_id), UNIQUE(period_id) WHERE is_pool
plan_moves(id, period_id→, from_line_id→ NULL, to_line_id→ NULL, amount >0, reason, created_at)
carry_overs(id, from_period_id→, plan_line_id→, action, amount, goal_id NULL, created_at)

recurring_rules(id, workspace_id→, series_id, name, kind, amount, amount_mode, account_id→,
                to_account_id NULL, category_id NULL, goal_id NULL, payee,
                freq, interval, by_month_day, weekend_policy, start_date, end_date NULL,
                max_count NULL, status, paused_until NULL, auto_post, remind_days_before)
recurrence_exceptions(rule_id→, original_date, action, override_date, override_amount,
                      transaction_id NULL)  PK(rule_id, original_date)

goals(id, workspace_id→, type, name, target_amount, currency, target_date NULL, priority,
      kept_in_account_id NULL, emergency_months NULL, repeat NULL, status, archived_at)
goal_contributions(id, workspace_id, goal_id→, date, amount ≠0, source, transaction_id NULL,
                   period_id NULL, note)

audit_events(id, workspace_id, user_id, entity, entity_id, action, diff JSONB, request_id, at)
```

**Important indexes**
- `transaction_lines (workspace_id, account_id, date)` and `(workspace_id, category_id, date)`.
- `transactions (workspace_id, date DESC, id DESC) WHERE deleted_at IS NULL` (cursor pagination).
- `goal_contributions (goal_id, date)`; `recurring_rules (workspace_id, status)`.
- Trigram/unaccent index on `payee`. Turkish casing matters: `MİGROS` must match `migros`; handle `ı`/`i`.

**Invariants enforced in services** (backed by tests): same-currency transfer lines sum to zero; on-budget expense/income lines require a category; line currency = account currency (guaranteed by the composite FK); closed-period plan lines can't be edited without an explicit reopen.

**Balances** = opening-balance transaction + Σ lines. No stored balance column in the MVP (can't drift). Add a cache only if measurements require it.

**Historical data:** frozen base amounts on lines; plan periods keep planned amounts, carry-ins and moves; closing writes CarryOver records; price/FX history tables (v1.1) and net worth snapshots keep what can't be recomputed; archived categories/accounts keep history.

**Deletion policy:**
- **Soft delete** (`deleted_at`) for transactions (enables undo).
- **Archive** (`archived_at`) for accounts, categories and goals with history.
- **Hard delete only** when a whole workspace/user is deleted (KVKK right to erasure), cascading via `workspace_id`.

---

## 8. Investment Data Model (v1.1)

**Assets**
- `assets(id, kind, symbol, market, name, quote_currency, unit, provider_codes JSONB, workspace_id NULL)`
  - **kind:** equity, fund, etf, precious_metal, crypto, other
  - **market:** BIST, TEFAS, NASDAQ, NYSE, CRYPTO, COMMODITY, CUSTOM
  - **unit:** share, unit, gram, piece, ounce
  - **workspace_id** set only for user-defined assets
- Global shared catalogue; custom assets belong to a workspace.
- Physical gold: unit gram or piece (çeyrek, yarım, tam) with configured gram equivalent and purity.
- **Asset class** for allocation (stocks, funds, gold, FX, crypto, cash) maps from `kind`, overridable per asset.

**Investment accounts** are `accounts` with `type = investment`, `on_budget = false`. Ledger balance = uninvested cash; holdings come from events.

**Events** (`investment_events`), the source of truth:

| Type | Quantity | Cost basis | Cash line generated |
|---|---|---|---|
| BUY | +q | +(q·p + fees) | −(q·p + fees) on the cash account |
| SELL | −q | −avg·q; realized = q·p − fees − tax − avg·q | +(q·p − fees − tax) |
| OPENING_POSITION | +q | +given total cost | none (onboarding) |
| DIVIDEND / DISTRIBUTION | — | — | +net; gross and withholding recorded; **counts as investment income** |
| INTEREST | — | — | +amount (investment income) |
| FEE / TAX | — | — (or added to cost, configurable) | −amount |
| SPLIT / BONUS (*bedelsiz*) | ×ratio | unchanged (avg ÷ ratio) | none |
| RIGHTS (*bedelli*) | +q | +q·subscription price | −cash |
| TRANSFER_OUT / TRANSFER_IN | ∓q | basis moves with units | none |

Fields: `account_id, asset_id, type, trade_date, quantity, price, price_currency, fees, tax, gross_amount, fx_rate_to_base, cash_account_id, transaction_id, notes`.

**DEPOSIT and WITHDRAWAL are not investment events** — they are ledger transfers into/out of investment accounts. **Contribution** = cash crossing the portfolio boundary: transfers into investment accounts, plus BUYs paid directly from an on-budget account (e.g., TEFAS funds bought from a bank app).

**Holdings: stored or calculated?**

| Option | Pros | Cons |
|---|---|---|
| Store and edit directly | Simple reads | Drifts; backdated edits corrupt it; no audit |
| Calculate on every read | Always correct | Repeated work; hard to snapshot |
| **Event-sourced projection (chosen)** | Correct and fast; deterministic rebuild | Rebuild logic must be well tested |

`holdings(account_id, asset_id, quantity, cost_basis_base, cost_basis_quote, avg_cost, realized_pnl_base, updated_at)` is **rebuilt for the affected (account, asset) inside the same DB transaction** whenever its events change, by replaying events through a pure domain fold. Backdated edits work; the cost-basis method can later change (e.g., FIFO) without a migration.

**Cost basis:** weighted average cost by default. Example: 100 @ 280 + 50 @ 300 + 30 @ 250 = **180 units, 50,500 TL cost, 280.5556 average**. Fees included in cost. SELL never changes average cost; it realizes P&L against it.

**Multiple currencies:** each event stores `fx_rate_to_base`, so a USD stock has USD and TRY cost bases. TRY P&L includes the currency effect (price vs FX split in v2).

**Market prices**
- `asset_prices(asset_id, price_date, close, currency, source, fetched_at)` PK `(asset_id, price_date)` — end-of-day history.
- `asset_quotes(asset_id, price, as_of, source)` — latest intraday.
- `manual_prices(workspace_id, asset_id, date, price)` — overrides and custom assets.
- Valuation uses the latest price on/before the date, with a **staleness flag** past a limit.

**Portfolio snapshots:** daily job writes `portfolio_valuations(workspace_id, date, value_base, cost_base, net_contributions_base, by_class JSONB)`. Market growth = ΔValue − net contributions (example: 300k − 200k − 80k = **+20k market, +80k contributions**). TWR and XIRR (v2) come from the same table.

**Türkiye-specific:** frequent *bedelsiz* bonus issues (split-adjusted price history); *stopaj* withholding on fund gains and dividends; TEFAS funds price on T+1 or later (trade date ≠ price date); gold prices differ between spot, bank gold accounts and the physical market.

---

## 9. Savings and Goals Architecture

**Three separate ideas:**
1. **Savings account** — where money physically sits (a ledger Account).
2. **Goal** — a purpose with a target.
3. **Funding** — how money is attributed to a goal.

**Two funding modes on one Goal entity:**
- **Tracked (MVP):** progress = Σ `goal_contributions` (earmarks). Optional "kept in" account; warn *"₺X more is earmarked than this account holds"* when earmarks exceed its balance. Contributions come from:
  - a plan savings line marked done (creates transfer + contribution)
  - a manual earmark (money stays in the same account)
  - a rollover at period close
  - a transfer linked afterwards
- **Linked (v2, "Combined"):** `goal_funding_sources` point at accounts or holdings with an allocation mode (whole balance, fixed amount, percentage, quantity — e.g., *25.6 g of 30 g gold*). Progress = current market value. A source can never be allocated over 100% across goals (no double counting).

**Spending from a goal:** the expense line carries `goal_id` → negative contribution, and it **does not count against this month's Available to spend**. This is what makes sinking funds work.

**Goal types:**
- **Emergency fund:** target = months × essential monthly expenses (from the current plan's essential + debt lines; 3-month actual average shown alongside).
- **Sinking fund:** due date + optional `repeat` (annual insurance resets after payment).
- **Savings goal:** general target.

**Required monthly** = (target − current) ÷ contribution months left: 100k over 10 months = **10,000/month**; 15,000 in 5 months = **3,000/month**. **"Add to plan"** creates a plan line.

**Investments connected to goals** go through funding sources (v2). Nothing in the MVP schema blocks it.

---

## 10. Budgeting Architecture: the financial rules

**Flow-based, not cash-based.** Mizan plans *this period's income* (YNAB plans cash on hand). More intuitive for salaried users, but plan and balances can drift; handled by "start from today" onboarding and the **pool carry-in**.

**Definitions for period P = [start, end)**
- **Period:** anchored to `period_start_day` (1–28), stored with explicit start/end dates.
- **Plan lines:** each line L is a category, a goal, or the single **pool** ("Available to spend"). The pool covers every flexible category without its own line, plus uncategorized spending.
- **Actual(L):**
  - *Expense/debt/investment category:* outflows on on-budget accounts in that category dated in P, minus refunds, **excluding** goal-funded lines. Subcategories without a line of their own are included; one with a line keeps its spending to itself.
  - *Goal line:* contributions to that goal dated in P.
  - *Pool:* spending in flexible categories without their own line, plus on-budget spending with no category at all.
  - Only `expense`, `income` and `transfer` lines count. An opening balance is not spending and a reconciliation is a correction; an in-budget transfer's legs cancel, and one leaving the budget carries a category on its on-budget leg (ADR 0011).
- **Who answers for a category:** a category with a line answers for itself. Without one, a flexible category is covered by the **pool** and a subcategory by its **parent**; the cover carries the remainder and the overspend, while the row still reports its own spending. An essential, debt, savings or investment category with no line answers for itself, so anything spent on it surfaces as an overspend the plan never accounted for. Totals add up only the rows that answer for themselves, which is what counts every lira exactly once.
- **Clearing an allocation removes the line** rather than storing a zero, which is what hands a flexible category back to the pool and a subcategory back to its parent (ADR 0011).
- **Income I:** per income category, `counted = received + max(expected, actual − received)`, where `received` sums the items the user has confirmed (at the amount they confirmed), `expected` sums the ones they have not, and `actual` is what the ledger recorded in that category this period (ADR 0011). An item counts its expectation until the money overtakes it; a confirmed item counts what was confirmed, so a short salary shows the plan as over-allocated. A category with no item has `expected` of zero, so everything in it is **unplanned income**.
- **Allocated A** = Σ planned(L) (plan moves net to zero).
- **Unassigned U** = I + pool carry-in − A. Aim: U = 0. U > 0 → "Left to allocate"; U < 0 → "Over-allocated".
- **Available(L)** = planned + carry_in + moves_in − moves_out − actual. **Overspend(L)** = max(0, −Available(L)).
- **Available to spend (ATS)** = Available(pool) − Σ uncovered Overspend(L) + min(0, U). *(Pending decision D4.)*
  - ATS never shows money the user doesn't have.
  - **"Cover"** creates a PlanMove recording where the money came from.
- **Safe to spend today** = max(0, ATS excluding today's spending) ÷ days left including today. Mockup: 9,000 − 6,000 = 3,000 ÷ 10 = **300**. Today's remaining = safe today − today's spending; unspent allowance rolls into tomorrow because the formula recomputes daily.
- **Transfers:** between on-budget accounts → no plan effect. On-budget → off-budget (investment, loan): the on-budget line **must carry a category** (Investments, Loan payment).
- **Credit cards** are on-budget. A purchase is spending on its date. Paying the statement is a **transfer** (no double counting); the UI labels it as such in upcoming payments.

**Closing a period (rollover)**
- **Leftover (Available > 0):** rollover flag on → carries into the same line next period; otherwise → next pool carry-in. In the review, the user can instead send it to a goal (contribution dated at period end) or investments.
- **Uncovered overspend:** reduces the next pool carry-in unless covered during review.
- **Pool leftover:** next carry-in, a goal, or investments.
- **Never-closed period:** auto-closed N days after it ends using defaults; review can still be opened.
- **Closed period edited later:** marked *changed after close*. Re-closing posts the delta to the **current** period's pool as "adjustment from \<month\>". Never a multi-month cascade.

**Rounding:** percentage allocations (DCA, rules, 50/30/20) use the **largest-remainder method** so parts sum exactly to the total.

---

## 11. Recurring Transaction System

- **Occurrences are virtual:** expanded on demand by pure `expand(rule, exceptions, from, to)`. Future transactions are **never** pre-inserted.
- **Fixed vs estimated:** estimated amounts shown with "~"; actual entered on confirm; from v1.1 the estimate learns from recent bills.
- **Due dates:** day 29–31 falls on the month's last day in shorter months. Weekend policy: none / previous business day / next business day. Turkish public holidays in v2.
- **Occurrence states:** upcoming → due → overdue (past due, not posted/skipped) → posted or skipped.
  - **Confirm** creates the transaction with `(rule_id, occurrence_date)`; unique constraint prevents duplicates.
  - **Skip** writes an exception.
- **Auto-post:** opt-in, fixed amounts only, idempotent daily job. Default is manual confirmation (auto-posting a failed payment makes balances drift silently).
- **Editing:**
  - *Only this:* exception override (date and/or amount).
  - *This and future:* end the current rule the day before; new rule with the same `series_id` from that date.
  - *Entire series:* update in place; affects only unposted occurrences; posted transactions never rewritten.
- **Pausing/ending:** `status = paused` with optional `paused_until`; end via `end_date` or `max_count`.
- **Transfer rules** (auto-transfer to goals): confirming creates the transfer and goal contribution together.
- **Link to the plan:** a rule's category/goal prefills next period's lines and income items; warn *"Netflix (Subscriptions) isn't covered by the plan"* when uncovered.
- **Matching (v1.1):** a similar manual/imported transaction (same category, amount ±~10%, date ±~5 days) prompts "Is this Netflix for October?".

---

## 12. API Structure

**Conventions:** `/api/v1`, JSON, camelCase; money as decimal strings with currency; dates `YYYY-MM-DD`; cursor pagination; RFC 9457 `problem+json` errors; idempotent creates via client UUIDs; OpenAPI from Zod; every route requires a session and is workspace-scoped.

| Resource | Responsibility |
|---|---|
| `/auth/*` | Sign up, sign in, sign out, session, verify email, reset password (auth library) |
| `/me`, `/workspace/settings` | Profile, locale, base currency, period start day |
| `/accounts` · `/:id` · `/:id/reconcile` | CRUD/archive, balances, reconcile (adjustment transaction) |
| `/categories`, `/category-groups` | CRUD, reorder, archive, merge |
| `/transactions` · `/:id` | Filtered list (date, account, category, text, type, amount); create (discriminated union: expense, income, transfer, split); update; soft delete/restore |
| `/plans/current`, `/plans/:start` | Plan read model: lines + actual, available, %, status; summary (I, A, U, ATS, safe today) |
| `/plans/:start/lines`, `/income-items`, `/moves` | Edit allocations, cover overspend |
| `/plans/:start/copy-from/:prev`, `/review`, `/close`, `/reopen` | Templates and period lifecycle |
| `/recurring` · `/:id` · `/:id/occurrences?from&to` | Rules; this/future/all edits |
| `/recurring/:id/occurrences/:date/{confirm,skip,override}` | Single-occurrence actions |
| `/upcoming?days=7` | Upcoming and overdue across rules |
| `/goals` · `/:id` · `/:id/contributions` | Goals, contributions, required monthly, emergency fund recommendation |
| `/dashboard` | One aggregated read model |
| `/export`, `DELETE /me` | Data portability, erasure |
| *v1.1* `/imports` (upload, `/:id/mapping`, `/:id/preview`, `/:id/commit`) | CSV pipeline |
| *v1.1* `/assets?q=`, `/assets/:id/prices`, `/investment-events`, `/portfolio`, `/portfolio/{holdings,allocation,income}` | Investments |
| *v1.1* `/accounts/:id/loan`, `/installments`, `/net-worth`, `/net-worth/history`, `/reports/*`, `/fx-rates` | Liabilities, net worth, reports |
| *v2* `/forecast`, `/simulations`, `/allocation-targets`, `/rules`, `/health-score` | Planning the future |

---

## 13. Frontend Page Architecture

**Navigation** (adapted from the mockup's grouped sidebar):
- **Daily:** Home, Plan, Transactions, Upcoming / Calendar
- **Wealth:** Goals, Investments, Accounts *(includes debts and net worth)*
- **Review:** Reports
- **Tools:** What-if
- **Always available:** global quick-add (floating button on mobile), ⌘K search, Settings

Changes from the mockup: Savings + Goals merged; Debts become a liability group on Accounts with a loan detail view; Net Worth becomes the Accounts header + history tab (own page later if justified); Accounts moves out of "Review".

| Page | MVP content | Later |
|---|---|---|
| **Home** | Safe to spend today + "how is this calculated", plan summary, Needs attention (overdue, overspent, unfunded sinking fund), 7-day upcoming, budget performance, goal progress, recent transactions, account balances | Cash flow chart, net worth, portfolio |
| **Plan** | Month switcher, income / allocated / left to allocate, grouped lines (Essential, Flexible, Debt, Savings, Investments, Available to spend) with planned, spent, remaining, progress; inline editing with live totals; copy month; rollover toggles; close & review | Allocation mix vs 50/30/20, rules |
| **Transactions** | Day-grouped list, URL filters, search, quick add/edit drawer, split editor, transfer form, bulk recategorize, soft delete + undo | Import, tags, review queue, export |
| **Upcoming** | Recurring rules, 7/30-day list with confirm/skip/override | Calendar grid, projected balance |
| **Accounts** | Grouped accounts, balances, detail with transactions, reconcile, archive, simple net worth number | Loans, manual assets, net worth history, multi-currency |
| **Goals** | Emergency fund (1/3/6 months), savings goals, sinking funds, contributions, "add to plan" | Combined goals, real-return projections |
| **Settings** | Profile, password, period start day, categories, export, delete account | 2FA, sessions, workspace sharing |
| **Onboarding** | Wizard (F1) | — |

**Not in the MVP:** Investments, Debts page, Net Worth history, Reports, Calendar grid, What-if, Assistant, Import.

---

## 14. Component Strategy

- **Money primitives:** `MoneyText` (tabular numerals, sign, currency, privacy masking, negative/positive/overspent coloring); `CurrencyInput` (parses `tr-TR` "50.000,50", "50,000.50" and "1200+350"; never produces a float); `PercentText`, `DeltaText`.
- **Metrics:** `MetricCard`, `MetricRow`, `ExplainPopover` ("How this is calculated"). **Every calculated number gets one** — a product principle.
- **Progress:** `BudgetProgress` (expected-pace marker), `GoalProgress` (segments for multi-source goals), `StackedAllocationBar`.
- **Plan:** `PlanGroup`, `PlanLineRow` (inline edit), `PoolRow`, `UnassignedBanner`, `RolloverDecision`.
- **Transactions:** `TransactionTable` (virtualized, day-grouped), `TransactionRow`, `QuickAddSheet`, `SplitEditor`, `CategoryPicker` (Turkish-aware search), `AccountPicker`, `BudgetImpactPreview`.
- **Scheduling:** `UpcomingList`, `OccurrenceActions`, `RecurrenceEditor`, `EditScopeDialog` (this / future / all).
- **Charts** (visx wrappers): `BarChart`, `LineChart`, `Sparkline`, `Donut`, reading theme tokens.
- **Feedback/layout:** `AppShell`, `SideNav`, `MobileTabBar`, `PeriodSwitcher`, `DateField`, `EmptyState`, `Toast` with undo, `ConfirmDialog`, `Skeleton`, `AttentionItem`.

**Theming:** port the `--m-*` tokens from `design/new-design/Mizan Design System.dc.html` (dark + light, Geist, `tnum`) into Tailwind theme variables. **Do not reuse mockup code** — it calculates money with JS floats and `Math.round`.

---

## 15. Security and Privacy

| Area | MVP (essential) | Later hardening |
|---|---|---|
| Passwords | Argon2id (auth library), min length + breached-password check (HIBP k-anonymity), hashed single-use expiring reset tokens | Passkeys |
| Authentication | Server sessions; `httpOnly; Secure; SameSite=Lax` cookies; rotation on login; idle + absolute expiry; log out everywhere | TOTP 2FA (v1.1), device list, new-device alerts |
| Authorization/isolation | Every query scoped by `workspace_id` in repositories; **automated cross-tenant test against every endpoint** | Postgres RLS as second layer; roles for shared workspaces |
| Input/injection | Zod on every input; parameterized SQL via Drizzle; no raw SQL interpolation | — |
| XSS/CSRF | React escaping, strict CSP, no `dangerouslySetInnerHTML`; SameSite + Origin/`Sec-Fetch-Site` checks on state-changing requests | CSRF tokens if cross-site embedding is ever needed |
| API protection | Auth rate limits (per IP and account), generic auth errors, body size limits, helmet headers, CORS limited to app origin | Per-user quotas, bot protection |
| Encryption | TLS everywhere; encryption at rest via managed DB/disk | Field-level encryption **not** for amounts (breaks SQL aggregation); maybe free-text notes |
| Logging | Structured logs with request IDs; **no request bodies, amounts or notes**; PII redaction | Retention policy; Sentry with scrubbing |
| Audit trail | Auth events (login, password change, export, delete) | Full entity audit log (v1.1), user-visible |
| Secrets | Env vars validated at startup; never committed; platform secret store | Rotation policy |
| Backups | Managed PITR + daily logical dumps to separate storage; **one restore drill before launch** | Scheduled restore tests |
| Privacy (KVKK/GDPR) | Data export (JSON/CSV), account deletion, privacy notice, data minimization | Processing register, VERBİS if commercial, AI-assistant consent |
| Imports (v1.1) | Size/type limits, streaming parser; **CSV export guards against formula injection** (`=,+,-,@`) | Malware scanning if attachments arrive |
| Dependencies | Lockfile, Renovate/Dependabot, `pnpm audit` in CI | SAST, pentest before public launch |

---

## 16. Financial Calculation Rules

**Where calculations live:** `packages/domain` — pure, deterministic functions; decimal in, decimal out; no I/O; no `Date.now()` (clock injected).
- **SQL aggregates, the domain decides:** repositories return sums; domain functions apply rules (pool, overspend, rollover).
- **Services assemble read models.**
- **The UI only formats**, calling domain functions only for live previews.

| Calculation | Rule |
|---|---|
| Unassigned, ATS, safe today | §10 |
| Budget usage | actual ÷ (planned + carry_in + net moves); status on track / near limit (≥ expected pace) / over |
| Expected pace | elapsed days ÷ period days |
| Savings rate | (savings + investment contributions) ÷ income; also (income − spending) ÷ income. **Both definitions documented** |
| Goal progress, required monthly | §9; months counted inclusively to the target month |
| Emergency fund coverage | goal balance ÷ essential monthly expenses (82,000 ÷ 24,800 = 3.3 months) |
| Account balance, net worth | Σ lines in account currency → base at valuation-date rate; net worth = assets − liabilities |
| Average cost, realized/unrealized P&L | §8 fold; unrealized = qty × price − remaining cost |
| Allocation and drift | class value ÷ total; drift = actual − target (pp); tolerance bands |
| Contribution vs market | ΔValue − net contributions |
| Returns *(v2)* | TWR (chain-linked daily), MWR (XIRR), real = (1 + nominal) ÷ (1 + CPI) − 1 (1.28 ÷ 1.23 − 1 ≈ +4.07%) |
| Debt *(v1.1/v2)* | Annuity schedule, payoff month, extra-payment simulator. **KKDF/BSMV make nominal-rate formulas inaccurate → store the actual installment schedule as truth** |
| Recurring expansion | §11 `expand()` |
| Percentage splits | Largest-remainder method |
| Rounding | Full precision inside calculations; half-up to minor units at persistence and display |

---

## 17. External Data Sources

| Need | Feature | Candidate sources | Notes |
|---|---|---|---|
| FX rates | Multi-currency, net worth | **TCMB daily rates** (official, free); TCMB EVDS for history; ECB fallback | Business days only; weekends use last rate |
| Gold/silver | Investments, net worth | XAU/USD × USD/TRY ÷ 31.1035, or a Turkish market source | Spot vs bank vs physical differ; user picks basis; çeyrek/yarım/tam gram equivalents |
| TEFAS funds | Investments | TEFAS published prices | No documented public API; scraping fragile/ToS; manual fallback |
| BIST equities | Investments | Licensed vendor (EOD or 15-min delayed) | Real-time needs a Borsa İstanbul licence; unofficial feeds risky |
| US stocks/ETFs | Investments | Twelve Data, Finnhub, Alpha Vantage | Free tiers rate-limited; batch EOD |
| Crypto | Investments | CoinGecko, Binance public tickers | — |
| Inflation (CPI) | Real return, real net worth | TÜİK CPI via TCMB EVDS | Monthly with lag; alternative series possible |
| Bank data *(long-term)* | Import | Open banking providers | Must feed the **same import pipeline** as CSV |

```ts
// Conceptual only
interface PriceProvider {
  id: string
  supports(asset: AssetRef): boolean
  latest(assets: AssetRef[]): Promise<Quote[]>                    // batched
  history(asset: AssetRef, from: PlainDate, to: PlainDate): Promise<DailyPrice[]>
}
interface FxProvider    { rates(date: PlainDate, base: Ccy, quotes: Ccy[]): Promise<FxRate[]> }
interface SeriesProvider { series(code: 'CPI_TR', from: PlainDate, to: PlainDate): Promise<IndexPoint[]> }
interface TransactionSource {        // CSV parser today, open banking tomorrow
  normalize(input: unknown): AsyncIterable<NormalizedTxn>       // → staging → dedupe → categorize → commit
}
```

**Rules:** providers called **only by worker jobs**; a registry maps `asset.provider_codes` to providers with priority and fallbacks; results stored with `source` and `fetched_at`; the app reads only from tables and shows staleness; a new vendor = one adapter, no domain changes.

---

## 18. Testing Strategy

| Layer | Tooling | Focus |
|---|---|---|
| **Financial calculations** | Vitest + **fast-check** | Golden scenarios (50k plan; 180 units at 280.56; 300 − 200 − 80; 9,000 ÷ 30 = 300) and **properties**: splits sum to total; buy-then-sell-all → zero qty and cost; replay = incremental; U = 0 after "allocate remaining"; rollover conserves money. ≥ 95% branch coverage |
| Unit (other) | Vitest | Recurrence (month ends, leap years, pauses, series splits), dates/periods with fixed clock and TZ, Turkish number parsing |
| Backend integration | Vitest + **Testcontainers Postgres**, per-test transaction rollback | Repositories, constraints (composite FKs, uniques), balance queries, period-close cascade |
| API | Fastify `inject` | Contracts, status codes, validation errors, **generated cross-tenant isolation suite**, idempotent creates |
| Frontend | Testing Library + MSW | CurrencyInput, plan inline editing + live totals, quick add, split editor, a11y checks |
| End to end | Playwright | Onboarding → plan → expense → safe-to-spend changes → confirm recurring → close month |
| Migrations | CI | Apply to empty DB and to a seeded DB |

CI: lint, typecheck, unit, integration, API tests and build on every push; E2E on main. A lint rule bans `parseFloat`, `Number()` and arithmetic on money types outside the formatter.

---

## 19. Project Folder Structure

```
mizan/
├─ apps/
│  ├─ web/                      # React SPA
│  │  └─ src/
│  │     ├─ app/                # router, providers, AppShell, theme
│  │     ├─ features/           # plan/, transactions/, accounts/, goals/, recurring/, dashboard/, auth/, settings/
│  │     │   └─ <feature>/{api,components,routes,forms}
│  │     ├─ components/{ui,finance,charts}
│  │     ├─ lib/{api-client,format,i18n,query-keys}
│  │     └─ locales/{tr,en}
│  └─ api/                      # Fastify API + worker entrypoint
│     └─ src/
│        ├─ main.ts · worker.ts · app.ts
│        ├─ config/ · plugins/{auth,db,errors,rate-limit,security}
│        ├─ modules/<module>/{routes,service,repository}.ts + *.test.ts
│        ├─ jobs/ · integrations/{fx,prices,series}/
│        └─ db/{schema,migrations,seed}
├─ packages/
│  ├─ domain/                   # pure TS: money, dates, period, budget, goals, recurrence, investments, debt
│  ├─ contracts/                # Zod schemas + DTO types + OpenAPI
│  └─ config/                   # tsconfig, eslint, prettier presets
├─ e2e/                         # Playwright
├─ infra/                       # docker-compose (dev/test), Dockerfiles, deploy config
├─ design/                      # existing mockups (reference only)
├─ docs/
│  ├─ PLAN.md                   # this plan
│  ├─ adr/                      # architecture decision records
│  └─ glossary.md               # Plan, Pool, Unassigned, ATS, Carry-over… (EN↔TR)
└─ CLAUDE.md                    # session guide for Claude Code
```

---

## 20. Development Phases

Every phase's Definition of Done also includes: CI green, tests written in the same phase, no money handled as `number`, ADR/glossary updated if a decision changed, and the phase tracker at the top of this file updated.

### MVP

**Phase 0 — Project foundation**
- *Objective:* a working, tested project skeleton. Nothing user-facing.
- *Scope:*
  1. pnpm workspace with `apps/web`, `apps/api`, `packages/domain`, `packages/contracts`, `packages/config`; shared strict tsconfig, ESLint, Prettier; `.editorconfig`; Node 24 pinned via `.nvmrc` and `packageManager`.
  2. `infra/docker-compose.yml` with Postgres 18 for dev and a separate test database.
  3. **API:** Fastify app factory, Zod-validated env config, pino with request IDs, problem+json error handler, helmet + CORS defaults, `GET /api/v1/health` checking the DB, placeholder `worker.ts`.
  4. **Database:** Drizzle config, migration scripts (`db:generate`, `db:migrate`), initial migration with only the `currencies` table + seed.
  5. **Web:** Vite + React with TanStack Router and Query, i18n with `tr` and `en` resources, empty layout route, API client calling `/health`.
  6. **Tests:** Vitest in every package (one trivial test each); Testcontainers integration test for `/health`; Playwright smoke test (shell loads, health indicator OK).
  7. **CI:** GitHub Actions — install, lint, typecheck, test, build.
  8. **Docs:** `docs/adr/0001-stack.md`, glossary stub.
  9. `git init` on `main` with an initial commit. Push only when asked.
- *Out of scope:* auth, domain tables other than `currencies`, UI design work, money logic.
- *DoD:* `pnpm install && pnpm dev` starts web and API; `pnpm test` passes unit, integration and E2E locally; CI green; migrations apply cleanly to an empty DB.

**Phase 1 — Domain primitives (pure)**
- *Objective:* exact money and dates before any feature exists.
- *Features:* Money/Decimal types, currency registry, rounding, largest-remainder allocation, `tr-TR`/`en` formatting and parsing, PlainDate utilities, period calculation from start day, Istanbul clock abstraction.
- *Tests:* property tests + golden tests.
- *DoD:* ≥ 95% coverage in `domain`; money lint rule active.

**Phase 2 — Design system and app shell**
- *Objective:* the mockup's visual language in code.
- *Frontend:* tokens ported (dark/light), Geist + tabular numerals, AppShell with side nav and mobile tab bar, `MoneyText`, `CurrencyInput`, `MetricCard`, progress bars, dialogs, toasts, empty states.
- *Tests:* component tests (CurrencyInput parsing), a11y checks.
- *DoD:* component showcase route matches design tokens in both themes; mobile width works.

**Phase 3 — Auth, users, workspace**
- *Features:* sign up/in/out, password reset (console mailer in dev), personal workspace on sign-up, settings (base currency TRY, period start day, locale).
- *Backend:* Better Auth integration, session guard, workspace context, auth rate limits, origin checks.
- *Database:* users, sessions, workspaces, memberships, currencies seed.
- *Tests:* auth flows, session expiry, rate limiting, **cross-tenant test harness** (reused by every later phase).
- *DoD:* protected routes work; isolation harness exists.

**Phase 4 — Accounts and ledger core**
- *Features:* account CRUD/archive (cash, checking, savings, credit card), opening balance, balance calculation, reconcile/adjustment.
- *Database:* accounts, transactions, transaction_lines (composite FKs, indexes).
- *Backend:* ledger service enforcing invariants (lines, signs, transfers sum to zero).
- *Frontend:* Accounts page (list, detail, forms).
- *Tests:* invariants, balance queries, isolation.
- *DoD:* an account created with a 24,850 TL opening balance shows exactly that; reconcile works.

**Phase 5 — Categories and transactions**
- *Features:* default category template (groups, essential flags), category management, expense/income/transfer create/edit/soft-delete with undo, splits, list with URL filters and Turkish-aware search, quick add (desktop drawer, mobile sheet).
- *Tests:* split and transfer validation, search normalization, pagination, E2E quick add.
- *DoD:* the 1,600 TL supermarket split saves correctly; balances update.
- *Deferred (ADR 0010):* **bulk recategorize** — listed for the Transactions screen in §13 but not
  in this phase's features; it needs row selection the list does not have yet. The Dashboard's
  recent-activity panel still reads sample data until phase 11 owns that screen.

**Phase 6 — Monthly plan I**
- *Features:* periods, income items, category plan lines, the pool, Allocated, Unassigned, actual per line, copy previous month, inline editing with live domain preview, overspend status.
- *Database:* plan_periods, plan_income_items, plan_lines.
- *Tests:* golden 50k plan, refunds, subcategories, pool membership, expected → actual income switch.
- *DoD:* Plan page reproduces 27,000 / 6,000 / 8,000 / 9,000 with U = 0.
- *Deferred (ADR 0011):* the mockup's **"Changes from September"** and **"When October closes"**
  panels need the previous period's lines and the review projection, both of which belong to
  phase 10. Rollover flags are stored and shown but only take effect when a period closes.

**Phase 7 — Available to spend and safe-to-spend**
- *Features:* ATS, safe today, today's remaining allowance, Cover (plan moves), ExplainPopover, budget-impact preview in quick add.
- *Tests:* day boundaries, overspend coverage, over-allocation, last day of period.
- *DoD:* mockup example gives 300/day; spending 85 shows 215 left.

**Phase 8 — Goals**
- *Features:* emergency fund (1/3/6 months from plan essentials), savings goals, sinking funds with repeat, contributions (manual, from plan line, linked transfer), goal-funded expenses, required monthly, "add to plan", over-earmark warning.
- *Database:* goals, goal_contributions, `goal_id` on plan lines and transaction lines.
- *Tests:* required monthly (10k and 3k examples); goal-funded expenses excluded from ATS.
- *DoD:* Goals page shows the three types; plan savings lines track contributions.

**Phase 9 — Recurring and upcoming**
- *Features:* rule editor, virtual expansion, upcoming/overdue list, confirm/skip/override, this/future/all edits, pause/end, opt-in auto-post job, plan prefill from rules, uncovered-recurring warnings.
- *Database:* recurring_rules, recurrence_exceptions; pg-boss.
- *Tests:* exhaustive expansion edge cases, duplicate prevention, idempotent job.
- *DoD:* 7-day upcoming total correct; confirming creates exactly one transaction.

**Phase 10 — Month review and close**
- *Features:* review summary, leftover/overspend decisions, carry-ins, auto-close job, reopen, changed-after-close adjustment.
- *Database:* carry_overs.
- *Tests:* money conserved across closes; cascade limited to one step.
- *DoD:* September's 2,350 TL leftover can be rolled over, sent to a goal, or returned to the pool, and October reflects it.

**Phase 11 — Dashboard and onboarding**
- *Features:* `/dashboard` read model, MVP widgets, Needs-attention rules, onboarding wizard incl. "start from today".
- *Tests:* E2E onboarding → safe-to-spend.
- *DoD:* a new user reaches a plan and safe-to-spend number in about 5 minutes.

**Phase 12 — MVP hardening and release**
- *Features:* data export, account deletion, auth audit events, security headers/CSP review, rate-limit review, backups + restore drill, production deployment, full E2E suite, performance pass, a11y pass.
- *DoD:* deployed; restore tested; security checklist signed off.

### v1.1 (one phase each)

| Phase | Content |
|---|---|
| 13 | CSV import: encoding detection, bank profiles, column mapping, preview, dedupe, commit |
| 14 | Multiple currencies, TCMB rates, worker/provider infrastructure, frozen base amounts in UI |
| 15 | Investments I: assets, events, opening positions, holdings projection, average cost, P&L, manual prices |
| 16 | Investments II: price providers, portfolio page, allocation, dividends/interest into income |
| 17 | Liabilities: loans with schedules, manual assets, credit card installments (*taksit*) |
| 18 | Net worth and monthly snapshots |
| 19 | Calendar grid and 30-day balance projection |
| 20 | Reports v1 |
| 21 | Tags, payee categorization rules, full audit log, TOTP 2FA |

### v2 (one phase per bullet)
- Combined goals
- Performance analytics (TWR/MWR) and real return vs CPI
- Target allocation and DCA
- Forecast engine (90 days / 6 months)
- What-if simulator (reuses the forecast engine with hypothetical events)
- Debt simulator
- Rules engine
- Health score
- Notifications and PWA

---

## 21. Risks and Mitigations

| Risk | Why it is hard | Mitigation |
|---|---|---|
| **Money precision** | Floats leak via JSON, JS and charts | NUMERIC in DB, strings on the wire, decimal.js in domain, lint ban, property tests |
| **Meaning of the budget** | Pool, overspend, rollover, edits after close interact | Formal rules (§10) in the glossary, golden tests, ExplainPopover everywhere, one function computes ATS |
| **Flow plan vs real balances** | Plan may say "available" when checking is empty | Balance shown beside ATS; warn when ATS > cash on hand; "start from today"; reconcile |
| **Recurring edits** | Series vs occurrence, duplicates, time zones | Virtual occurrences, exceptions table, unique (rule, date), plain dates, exhaustive tests |
| **Credit cards and installments** | Double counting; *taksit* is how Turkish users think | Statement payment = transfer; dedicated installment phase; decision D5 |
| **Cost basis and corporate actions** | Frequent *bedelsiz*, rights issues, backdated edits | Event sourcing + replay, split events, adjusted price history, golden tests per event type |
| **Market data availability/licensing** | No official TEFAS API, BIST licensing, rate limits | Provider interfaces, stored prices only, staleness flags, first-class manual prices |
| **Currency conversion** | Which rate/date; weekends; historical stability | Frozen base amounts, TCMB rate on/before date, rate shown on transaction |
| **Turkish locale** | Decimal comma, `İ/ı` casing/search, Windows-1254 CSVs | Shared parse/format in `domain`, unaccent + ICU collation, import encoding detection |
| **Entry friction → churn** | Manual apps lose users | < 10 s quick add, recurring confirmation, payee memory, mobile-first entry |
| **Scope creep** (designs show v2) | Tempting, enormous surface | Strict phase gates; mockups are the target, not the MVP |
| **Forecasting/what-if** | Small errors compound | Same domain functions as the plan; v2 only after the ledger is proven |
| **Data isolation** | One bug exposes someone's finances | Repository scoping, generated cross-tenant tests, RLS later |

---

## 22. Decisions

Status legend: **Pending** = recommended default recorded, awaiting confirmation. When confirmed or changed, update the status here and record an ADR in `docs/adr/`.

| # | Decision | Recommended default | Blocks | Status |
|---|---|---|---|---|
| D1 | Stack | TypeScript monorepo: React + Vite SPA, Fastify, PostgreSQL, Drizzle, Better Auth | Phase 0 | **Confirmed** — [ADR 0001](adr/0001-stack.md) |
| D2 | Language and number format | i18n from day one; **English UI default, Turkish available** (changed from Turkish default); numbers formatted by locale (mockups use English/`₺50,000`) | Phases 0–2 | **Confirmed (changed)** — [ADR 0002](adr/0002-default-language-english.md) |
| D3 | Plan month anchor | Monthly periods with a configurable start day (1–28) chosen at onboarding, default 1st (not fixed-length periods) | Phase 1 | **Confirmed** — [ADR 0003](adr/0003-plan-period-anchor.md) |
| D4 | Overspending vs safe-to-spend | Conservative: uncovered overspending reduces ATS automatically; "Cover" records the source (the Dashboard mockup instead lowers the allowance only after clicking Cover — design to be updated) | Phase 7 | Pending |
| D5 | Credit card installments | MVP records the full amount on the purchase date; installment budgeting in v1.1 (Phase 17). Move into MVP after Phase 9 if central to usage (+~1 phase) | Phase 5/17 | **Confirmed** — [ADR 0010](adr/0010-categories-and-transactions.md) |
| D6 | Workspace ownership from day one | Yes (supports shared finance later and the "Personal ▾" switcher) | Phase 3 | **Confirmed** — [ADR 0008](adr/0008-auth-and-workspaces.md) |
| D7 | Currency scope in MVP | TRY only, currency columns everywhere; multi-currency in v1.1 | Phase 4 | **Confirmed** — [ADR 0009](adr/0009-ledger-core.md) |
| D8 | Navigation merges | Merge Savings + Goals; Debts + Net Worth into Accounts (§13) | Phase 2 | **Confirmed** — [ADR 0004](adr/0004-navigation-merges.md) |
| D9 | Audience | Built to launch quality, private beta in an EU region; review hosting/KVKK before any public launch in Türkiye | Phase 12 | Pending |
