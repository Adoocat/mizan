# ADR 0004: Navigation merges

- **Status:** Accepted (2026-10-06)
- **Decision:** D8 in `docs/PLAN.md` §22

## Decision

The navigation follows §13 of the plan instead of the mockup's sidebar:

- **Savings and Goals are one section (Goals).** Emergency fund, savings goals and sinking funds are
  all goals.
- **Debts and Net Worth live in Accounts.** Liabilities are an account group with a loan detail view;
  net worth is the Accounts header, with a history tab later.
- Accounts moves from "Review" to "Wealth".

MVP navigation: **Daily** (Home, Plan, Transactions, Upcoming) · **Wealth** (Goals, Accounts) ·
Settings. Investments, Reports and What-if are added to the navigation only in the phases that build
them.

## Consequences

There are fewer top-level pages, and each concept has one home. The mockups' Savings, Debts and
Net Worth pages are reference material for sections inside Goals and Accounts.
