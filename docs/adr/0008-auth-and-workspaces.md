# ADR 0008: Sessions, password storage and the workspace boundary

- **Status:** Accepted (2026-10-07)
- **Decision:** D6 in `docs/PLAN.md` §22 (confirmed), with the session and password choices phase 3
  had to settle
- **Phase:** 3

## Context

Phase 3 had to decide four things that every later phase builds on: who owns financial data, how a
session is proven and expired, how a password is stored, and where the credential endpoints live.

`docs/PLAN.md` §22 lists **D6 — workspace ownership from day one** as pending with a recommended
default of *yes*. The rest of the plan already assumes it: §7 requires `workspace_id` on every
financial table, CLAUDE.md lists "every query is scoped by it" as non-negotiable, and the mockups
show a "Personal ▾" switcher. The question was therefore not whether to adopt the default but
whether to write it down.

## Decision

### Workspaces from day one (D6: confirmed as recommended)

A **workspace** owns all financial data. Sign-up creates exactly one workspace per user, named
`Personal`, with the user as its `owner`, in the same transaction — a half-provisioned account
cannot exist. `workspace_members` carries a role (`owner` / `editor` / `viewer`); the MVP only ever
writes `owner`, but the column and the `assertCanWrite` check exist so shared finance needs no
migration later.

Request context resolves the caller's single membership (`requireSession`), and every repository
query is scoped by `workspace_id`. The cross-tenant harness in `apps/api/src/testing/isolation.ts`
checks every endpoint twice: anonymously (must be 401) and as a signed-in user from another
workspace (must be 403/404, and must not echo the other workspace's ids). Each phase adds its
endpoints to its module's `isolation.ts`.

### Better Auth owns credentials, mounted under the API

Better Auth (ADR 0001) handles sign-up, sign-in, sign-out, sessions and password reset at
`/api/v1/auth/*`. Its `baseURL` is the **web** origin, because the browser only ever sees that
origin and the web app proxies `/api` to this service: session cookies stay first-party, and the
reset links the library builds land on the web app's own route.

Mizan supplies the parts the plan specifies and the library does not default to:

- **Table names** from §7 (`users`, `sessions`, `auth_accounts`, `verifications`) through
  `modelName`, so the auth tables read like the rest of the schema and `auth_accounts` does not
  collide with the ledger's `accounts` (phase 4).
- **UUIDv7 primary keys** (`advanced.database.generateId`), matching §7 and letting
  `workspace_members.user_id` be a real `uuid` foreign key.
- **Argon2id hashing** (`@node-rs/argon2`, 19 MiB / t=2 / p=1, from the OWASP cheat sheet).
  Better Auth defaults to scrypt; §15 asks for Argon2id, so phase 3 passes its own hash/verify
  pair.

The browser uses Better Auth's client **only for the credential actions**. The signed-in user is
read from `GET /api/v1/me` through TanStack Query, so there is one source of session truth rather
than two caches that can disagree.

### Sessions: sliding expiry with an absolute ceiling

§15 asks for "idle + absolute expiry". Better Auth gives the first: a session expires 7 days after
its last use, and an in-use session's expiry is pushed forward at most once a day (one write per
day, not per request). The absolute ceiling is ours: `requireSession` refuses — and deletes — any
session created more than 30 days ago, however active it has been, so a stolen cookie cannot be
kept alive indefinitely. Cookies are `httpOnly`, `SameSite=Lax`, `Secure` in production, prefixed
`mizan`.

### Rate limits in two layers

- **Per IP**, by Better Auth: 60 requests/minute across the auth endpoints, tightened per path
  (10/min for sign-in, 20/hour for sign-up, 5/hour for a reset request). Storage is in-process.
- **Per account**, by `plugins/auth-rate-limit.ts`: 10 *failed* attempts per 15 minutes keyed by
  the email in the body, so an attacker spread across many addresses cannot grind one account.
  Only failures count and a success clears the budget, so a user signing in on several devices is
  never locked out by their own success.

Both layers are in-memory, which is right for a single instance. A shared store is part of the
phase 12 rate-limit review.

### Passwords

Minimum 12 characters and no composition rules — length is the only requirement that reliably
helps. Passwords in the Have I Been Pwned corpus are rejected (k-anonymity: only the first five
characters of the SHA-1 hash leave the server). That is an outbound call on the sign-up and
password-change paths, so `AUTH_BREACHED_PASSWORD_CHECK=false` switches it off for the automated
suites rather than making CI depend on a third-party service. It is on everywhere else.

### Cross-site request forgery

`SameSite=Lax` cookies, plus an origin check on every state-changing request:
`Sec-Fetch-Site` first (a page cannot forge it), falling back to `Origin`. A request with neither
header did not come from a browser and has no ambient cookie to abuse, so it passes.

## Consequences

- There is no email verification gate in the MVP: a new account is usable immediately
  (`requireEmailVerification` is off). The address is still recorded as unverified, so adding the
  gate later is a configuration change.
- Changing an email address is not in the MVP; the field is read-only in settings.
- Password reset has no mail provider yet. In development the link is printed to the console; in
  every other environment only the event is logged — never the address, link or token, because a
  reset link is a bearer credential (§15). A real provider arrives with phase 12.
- `@node-rs/argon2` is a native module. It ships prebuilt binaries for the platforms the project
  uses (Windows dev, Linux CI), but it is the first native dependency in the tree.
- Rotating `AUTH_SECRET` signs every user out.
