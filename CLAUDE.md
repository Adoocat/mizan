# CLAUDE.md

Guide for Claude Code sessions working on **Mizan**, a planning-first personal finance web app for users in Türkiye.

## Start here

1. Read [`docs/PLAN.md`](docs/PLAN.md). It is the master plan: product scope, architecture, domain model, financial rules and phases.
2. Check the **phase tracker** at the top of `docs/PLAN.md` to see where the project is.
3. Check **§22 Decisions** for anything still pending that affects the phase you're working on.

## How we work

- **One phase at a time.** The user hands over a single phase per prompt. Implement only that phase's scope; don't pull in features from later phases.
- **The screens already exist.** Every MVP screen was built during the 2.0 design revision and reads placeholder data from `apps/web/src/lib/sample-data.ts` through `useSampleData()` (ADR 0007). A phase wires its screen to the API, adds its mutations and domain tests, and **deletes its slice of the sample data**. Don't add new sample data to pages; don't rebuild the UI.
- **Ask before starting** if a pending decision in §22 blocks the current phase. Otherwise use the recommended default and say so.
- **Stop at the end of a phase** and summarize what was done, what was tested and anything deferred. Wait for approval before starting the next phase.
- **Keep the plan current.** When a phase is done, update the phase tracker. When a decision changes, update §22 and add an ADR in `docs/adr/`.
- **Commit or push only when asked.**

## Non-negotiable rules

### Money
- **Never use JavaScript `number` for money**, quantities, prices or FX rates. Use the Decimal/Money types from `packages/domain` (decimal.js).
- Database: `NUMERIC` columns (money `NUMERIC(20,4)`, quantity `NUMERIC(30,12)`, price `NUMERIC(24,10)`, FX `NUMERIC(20,10)`). Drizzle returns them as strings — keep them as strings until they enter the domain.
- API: money travels as `{"amount": "12000.00", "currency": "TRY"}`.
- Round half-up to the currency's minor units only at persistence and display boundaries.
- Percentage splits use the largest-remainder method so parts sum exactly to the total.

### Dates
- Business dates (transaction date, due date, period bounds) are plain `YYYY-MM-DD` dates, stored as `DATE`. Instants are `timestamptz` in UTC.
- Default time zone is `Europe/Istanbul`. Domain code never calls `Date.now()`; the clock is injected.

### Where logic lives
- **Financial rules belong in `packages/domain`**: pure, deterministic functions with no I/O.
- SQL does aggregation (sums); the domain applies the rules (pool, overspend, rollover, cost basis).
- The UI only formats. It may call domain functions for live previews, but the API is always authoritative.

### Data and security
- Every financial table has `workspace_id`, and every query is scoped by it. New endpoints must be covered by the cross-tenant isolation tests.
- Transactions are soft-deleted (`deleted_at`); accounts, categories and goals are archived (`archived_at`), not deleted.
- Account balances are derived from transaction lines. There is no stored balance column.
- Holdings (v1.1) are a projection rebuilt from investment events. Never edit them directly.
- Recurring occurrences are virtual. Never pre-insert future transactions.
- Validate every input with the shared Zod schemas in `packages/contracts`. No raw SQL string interpolation.
- Never log request bodies, amounts or notes.

### Tests
- Tests ship in the same phase as the code.
- Financial calculations need golden tests plus property tests (fast-check). Target ≥ 95% branch coverage in `packages/domain`.
- Integration tests run against a real Postgres (Testcontainers), not mocks.

## Key domain terms

| Term | Meaning |
|---|---|
| Workspace | Owner of all financial data (one personal workspace per user in the MVP) |
| Plan period | One budget month, anchored to the workspace's `period_start_day` |
| Plan line | An allocation to a category, a goal, or the pool |
| Pool / Available to spend (ATS) | The free-spending line; covers flexible categories without their own line |
| Unassigned (U) | Income + pool carry-in − allocated. Aim is zero |
| Safe to spend today | max(0, ATS excluding today's spending) ÷ days left including today |
| On-budget account | An account whose transactions affect the plan (cash, checking, savings, credit card) |
| Carry-over | What happens to a line's leftover or overspend when a period closes |
| Goal contribution | An earmark (or release) of money for a goal |

Full definitions: `docs/PLAN.md` §10 (budgeting rules), §9 (goals), §11 (recurring), §8 (investments).

## Stack (confirmed, see ADR 0001)

pnpm monorepo · TypeScript strict · React + Vite SPA · TanStack Router/Query · React Hook Form + Zod · Tailwind + shadcn/ui · visx · Node 24 + Fastify · Drizzle · PostgreSQL 18 · Better Auth · pg-boss · decimal.js · i18next · Vitest, fast-check, Testing Library, MSW, Playwright, Testcontainers.

- The API has no build step: Node 24 runs `.ts` files directly (type stripping). Use erasable syntax only (no `enum`, no constructor parameter properties) and `.ts` extensions in relative imports outside `apps/web`.
- Workspace packages export `src/index.ts` directly.
- English is the default UI language; Turkish is available (ADR 0002). Every user-visible string goes through i18next in both `en` and `tr`.

## Repository layout

```
apps/web          React SPA (features/, components/, lib/, locales/)
apps/api          Fastify API + worker (modules/<name>/{routes,service,repository}.ts)
packages/domain   Pure financial logic
packages/contracts Zod schemas, DTOs, OpenAPI
packages/config   Shared tsconfig/eslint/prettier
e2e/              Playwright tests
infra/            docker-compose, Dockerfiles, deploy config
design/           Mockups (reference only)
docs/             PLAN.md, adr/, glossary.md
```

## Commands

Requires Node 24 (`.nvmrc`), pnpm via Corepack, and Docker running (integration and E2E tests).

| Command | What it does |
|---|---|
| `pnpm install` | Install dependencies |
| `pnpm db:up` / `pnpm db:down` | Start/stop local Postgres 18 (`infra/docker-compose.yml`, bound to 127.0.0.1) |
| `pnpm db:migrate` | Apply migrations to `DATABASE_URL` (from `.env`) |
| `pnpm db:generate` | Generate a SQL migration from the Drizzle schema (`apps/api/src/db/schema`) |
| `pnpm dev` | API on :3000 and web on :5173 (web proxies `/api`) |
| `pnpm lint` · `pnpm typecheck` · `pnpm format` | Static checks |
| `pnpm test` | Unit + integration + E2E |
| `pnpm test:unit` | Vitest unit tests in every package (domain runs with coverage thresholds) |
| `pnpm test:int` | API integration tests against a Testcontainers Postgres |
| `pnpm test:e2e` | Playwright against a Testcontainers Postgres (first run: `pnpm --filter @mizan/e2e install-browsers`) |
| `pnpm build` | Production build of the web app |

Tests: unit tests are `*.test.ts(x)`, integration tests are `*.int.test.ts`. `apps/api/src/testing/postgres.ts` starts a migrated test database.

## Design reference

- `design/new-design/*.dc.html` are the current (**2.0**) high-fidelity mockups of the **long-term** product. Use them for layout, copy and visual language. The 1.0 files at the top of `design/` (and their copies in `design/new-design/v1/`) are superseded — don't port from them (ADR 0006).
- 2.0 keeps every colour of 1.0 and changes the shape: one canvas tone instead of panel borders, panels at 24px radius with no border or shadow, pill controls at 40px, and a light (weight 300) display type scale on top of the unchanged §02 scale.
- Design tokens are ported to semantic names in `apps/web/src/app/styles.css` and are the source of truth for code (ADR 0005). Use the Tailwind utilities (`bg-surface`, `bg-inset`, `text-ink-3`, `text-page-display`, `rounded-card`), not hex values. A few light-mode text colours are darker than the mockup for WCAG AA; Playwright runs axe with contrast checks in both themes.
- Use `cn()` from `apps/web/src/lib/cn.ts` to combine classes. If you add a type-scale token, register it there too.
- `/showcase` renders every design-system component; add new shared components to it.
- **Do not copy mockup code.** It computes money with JavaScript floats and `Math.round`.
- Mockups show features beyond the current phase (open banking, assistant, health score, the 2.0 landing page). Don't build them early.
