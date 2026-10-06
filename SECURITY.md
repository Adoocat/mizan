# Security Policy

Mizan handles personal financial data, so security reports are taken seriously.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report vulnerabilities privately through GitHub:
**Security → Report a vulnerability** on this repository (private vulnerability reporting).

Please include:

- what the issue is and where it lives (file, endpoint, or flow)
- steps to reproduce, or a proof of concept
- the impact you think it has

You can expect an acknowledgement within a few days. Please give us reasonable time to fix
the issue before disclosing it publicly.

## Scope

The project is in early development and is not yet deployed as a public service. Reports about
the code in this repository are welcome: authentication, workspace isolation, input validation,
injection, XSS/CSRF, secrets handling, and dependency issues.

## Practices

- No secrets are committed. Configuration comes from environment variables validated at startup;
  `.env` files are git-ignored and only `.env.example` (with local-only placeholder values) is tracked.
- Every financial query is scoped by workspace, and cross-tenant isolation is covered by tests.
- Logs never contain request bodies, query strings, amounts, notes, cookies or auth headers.
- Dependencies are locked (`pnpm-lock.yaml`), audited in CI, updated by Dependabot, and packages
  published less than 24 hours ago are not installed. Dependency install scripts are denied by default.
- CI runs with read-only permissions and third-party GitHub Actions are pinned to commit SHAs.

See `docs/PLAN.md` §15 for the full security and privacy plan.
