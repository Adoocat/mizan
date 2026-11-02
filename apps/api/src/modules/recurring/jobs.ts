import {
  addDays,
  occurrencesToAutoPost,
  recurringRuleKind,
  rolledTargetDate,
  todayIn,
  type Clock,
  type GoalRepeat,
  type PlainDate,
} from '@mizan/domain'
import type { Db } from '../../db/client.ts'
import { uuidv7 } from '../../lib/uuid.ts'
import { findAccounts } from '../accounts/repository.ts'
import { findGoals, updateGoal } from '../goals/repository.ts'
import { validateTransaction } from '../ledger/service.ts'
import {
  findAutoPostRules,
  findAutoPostWorkspaces,
  findExceptions,
  findPostedOccurrences,
  findRepeatingGoalWorkspaces,
} from './repository.ts'
import {
  isUniqueViolation,
  occurrenceLines,
  toDomainRule,
  toRecurrenceExceptions,
  writeOccurrence,
} from './service.ts'

/**
 * The daily background work recurring money needs (PLAN §11, §19).
 *
 * Both jobs are **idempotent**, which is the only property that matters here: a worker restart, a
 * retry or two instances running at once must not post the rent twice or roll an insurance date
 * two years forward. Auto-post leans on the partial unique index behind
 * `transactions_occurrence_key` rather than on its own bookkeeping, and the roll-forward is a
 * function of today's date, so running it again changes nothing.
 *
 * Neither takes a session: they run for every workspace, one at a time, through the ordinary
 * workspace-scoped queries. pg-boss only schedules them (see `worker.ts`), so every test exercises
 * the real behaviour without a queue.
 */

/**
 * How far back auto-post will reach (§11).
 *
 * Catching up matters — the worker may have been down for a day, and the point of auto-post is
 * that the user does not have to notice — but it is bounded, or switching auto-post on for a rule
 * that started last year would post a year of history into the ledger at once. A fortnight is
 * exactly the window the Upcoming list is already showing as overdue, so what the job posts is
 * what the user can already see waiting, and never a bill from a month they have closed.
 *
 * Deliberately not bounded by the rule's `created_at` as well: that instant comes from the
 * database's clock rather than the injected one, and a job that decides what is due today has to
 * answer to the same clock as everything else (decision D3).
 */
export const AUTO_POST_CATCHUP_DAYS = 14

export interface AutoPostResult {
  workspaces: number
  posted: number
  /** Occurrences another writer had already taken: a user's Confirm, or an earlier run. */
  alreadyPosted: number
  /** Rules that could not post, because an account they need has been archived. */
  blocked: number
}

/** Posts every occurrence that opted in and has come due. Safe to run as often as you like. */
export async function runAutoPost(db: Db, clock: Clock): Promise<AutoPostResult> {
  const result: AutoPostResult = { workspaces: 0, posted: 0, alreadyPosted: 0, blocked: 0 }

  for (const workspace of await findAutoPostWorkspaces(db)) {
    result.workspaces += 1
    const today = todayIn(clock, workspace.timezone)

    const rules = await findAutoPostRules(db, workspace.id)
    const ids = rules.map((rule) => rule.id)
    const [exceptions, posted, accountRows] = await Promise.all([
      findExceptions(db, workspace.id, ids),
      findPostedOccurrences(db, workspace.id, ids),
      findAccounts(db, workspace.id, { includeArchived: true }),
    ])

    const accounts = new Map(accountRows.map((row) => [row.id, row]))
    const postedByRule = new Map<string, PlainDate[]>()
    for (const row of posted) {
      const bucket = postedByRule.get(row.ruleId) ?? []
      bucket.push(row.occurrenceDate as PlainDate)
      postedByRule.set(row.ruleId, bucket)
    }

    for (const row of rules) {
      const occurrences = occurrencesToAutoPost(
        { ...toDomainRule(row), autoPost: row.autoPost },
        {
          from: addDays(today, -AUTO_POST_CATCHUP_DAYS),
          today,
          exceptions: toRecurrenceExceptions(
            exceptions.filter((one) => one.ruleId === row.id),
            row.currency,
          ),
          postedDates: postedByRule.get(row.id) ?? [],
        },
      )
      if (occurrences.length === 0) continue

      /*
       * An archived account cannot take a transaction, and auto-posting is the one path with
       * nobody there to be told. The rule waits instead of failing: un-archive the account, or
       * point the rule somewhere else, and the next run catches up.
       */
      const from_ = accounts.get(row.accountId)
      const to = row.toAccountId ? accounts.get(row.toAccountId) : undefined
      if (!from_ || from_.archivedAt || (row.toAccountId && (!to || to.archivedAt))) {
        result.blocked += 1
        continue
      }

      for (const occurrence of occurrences) {
        const kind = recurringRuleKind(row.kind)
        const lines = occurrenceLines({
          kind,
          row,
          from: from_,
          to,
          accountId: row.accountId,
          categoryId: row.categoryId,
          amount: occurrence.amount,
        })
        validateTransaction({ type: kind, lines })

        try {
          await writeOccurrence(db, {
            workspaceId: workspace.id,
            periodStartDay: workspace.periodStartDay,
            // Whoever wrote the rule owns what it posts; null once that user is gone.
            createdBy: row.createdBy,
            row,
            originalDate: occurrence.originalDate,
            date: occurrence.dueDate,
            amount: occurrence.amount,
            notes: row.notes,
            transactionId: uuidv7(),
            lines,
          })
          result.posted += 1
        } catch (error) {
          // The unique index refusing it means somebody else got there first, which is fine.
          if (!isUniqueViolation(error)) throw error
          result.alreadyPosted += 1
        }
      }
    }
  }

  return result
}

export interface RollGoalsResult {
  workspaces: number
  rolled: number
}

/**
 * Moves a repeating sinking fund's target date on once its bill has passed (decision D12).
 *
 * This is the piece phase 8 deferred to here. Until the date moves, the fund is stuck insisting
 * it needs its whole remainder *now* — `requiredMonthly` has no months left to divide by — and
 * the Goals page shows an annual insurance that is permanently overdue instead of one that comes
 * round next March.
 *
 * Only the date moves. Whatever the fund holds stays where it is, because the bill was paid out
 * of it and next year's saving starts from there.
 */
export async function rollRepeatingSinkingFunds(db: Db, clock: Clock): Promise<RollGoalsResult> {
  const result: RollGoalsResult = { workspaces: 0, rolled: 0 }

  for (const workspace of await findRepeatingGoalWorkspaces(db)) {
    result.workspaces += 1
    const today = todayIn(clock, workspace.timezone)

    for (const goal of await findGoals(db, workspace.id)) {
      if (goal.repeat === null || goal.targetDate === null) continue
      const targetDate = goal.targetDate as PlainDate
      if (targetDate >= today) continue

      const rolled = rolledTargetDate(targetDate, goal.repeat as GoalRepeat, today)
      // A function of today's date, so a second run in the same day changes nothing.
      if (rolled === targetDate) continue

      await updateGoal(db, workspace.id, goal.id, { targetDate: rolled })
      result.rolled += 1
    }
  }

  return result
}
