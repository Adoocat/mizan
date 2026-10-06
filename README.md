# Mizan

A planning-first personal finance app for people in Türkiye. Every lira gets a job when income arrives,
and Mizan answers one question each day: **how much can I safely spend today?**

> **Status:** early development. See [`docs/PLAN.md`](docs/PLAN.md) for the plan and phase tracker.

## Stack

TypeScript monorepo (pnpm) · React + Vite · TanStack Router/Query · Fastify · PostgreSQL 18 + Drizzle ·
decimal.js for all money math · Vitest, fast-check, Playwright, Testcontainers.
See [ADR 0001](docs/adr/0001-stack.md).

```
apps/web            React SPA
apps/api            Fastify API and background worker
packages/domain     Pure financial logic (money, dates, periods)
packages/contracts  Zod schemas shared by API and web
packages/config     Shared TypeScript and Prettier config
e2e/                Playwright tests
infra/              Docker Compose for local Postgres
docs/               Plan, ADRs, glossary
design/             Mockups (reference only)
```

## Getting started

Requirements: **Node 24**, **Docker** (running), and Corepack (bundled with Node 24).

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm dev
```

The web app runs at http://localhost:5173 and the API at http://localhost:3000/api/v1/health.

## Testing

```bash
pnpm lint && pnpm typecheck
pnpm test:unit      # all packages
pnpm test:int       # API against a throwaway Postgres (Docker)
pnpm --filter @mizan/e2e install-browsers   # once
pnpm test:e2e       # Playwright
```

## Security

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).
