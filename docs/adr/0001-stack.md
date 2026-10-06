# ADR 0001: Technology stack

- **Status:** Accepted (2026-10-06)
- **Decision:** D1 in `docs/PLAN.md` §22

## Context

Mizan needs exact money arithmetic shared by the API (authoritative) and the browser (live previews),
a relational store with exact decimals, and a small operational footprint for a single developer.

## Decision

The recommended default from §5 is accepted: a TypeScript (strict) pnpm monorepo with a React + Vite
SPA (TanStack Router and Query), a Fastify API, PostgreSQL 18 through Drizzle, Better Auth (Phase 3),
pg-boss (Phase 9), decimal.js, Zod and i18next. Testing uses Vitest, fast-check, Testing Library,
MSW, Playwright and Testcontainers.

Implementation choices made in Phase 0:

| Choice | Why |
|---|---|
| **Node 24 LTS**, pinned in `.nvmrc`, `engines` and CI | Plan default; current LTS |
| **The API runs TypeScript directly** with Node's built-in type stripping (`node src/main.ts`) | No build step or bundler for the API; workspace packages export their `src/index.ts`. Requires erasable syntax only (`erasableSyntaxOnly`), so no enums or parameter properties, and relative imports use `.ts` extensions |
| **pnpm 12** via Corepack (`packageManager` field) | Current release. Supply-chain settings live in `pnpm-workspace.yaml`: `minimumReleaseAge` (24 h) and a deny-by-default `allowBuilds` list |
| **TypeScript 6.0**, not 7.0 | typescript-eslint (type-aware lint rules) supports TypeScript < 6.1 only. Revisit when it supports 7 |
| **MSW 2**, not 3 | Vitest 5's mocker peers on MSW 2 |
| **node-postgres (`pg`)** as the Drizzle driver | pg-boss uses it too, so there's one driver |
| Integration and E2E tests start Postgres with **Testcontainers** | No shared state between runs; the Compose database is only for local development |

## Consequences

- Contributors need Node 24 and Docker (for integration and E2E tests).
- Without an API build step, production images ship TypeScript sources and run them on Node 24.
- Migrating to TypeScript 7 waits on typescript-eslint support.
