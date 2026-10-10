import type {
  CopyPlanInput,
  MoneyDto,
  CopyPlanResponse,
  CreatePlanIncomeItemInput,
  PlanChildRowDto,
  PlanGroupDto,
  PlanIncomeItemDto,
  PlanResponse,
  PlanRowDto,
  PlanSummary,
  UpdatePlanIncomeItemInput,
  UpsertPlanLineInput,
} from '@mizan/contracts'
import { moneyFromDto } from '@mizan/contracts'
import {
  Money,
  allocatedTotal,
  categoryGroupKind,
  countedIncome,
  compareCategoryGroupKinds,
  daysElapsed,
  isPooledByDefault,
  periodContaining,
  periodLength,
  planLineAvailable,
  planLineOverspend,
  planTotals,
  previousPeriod,
  shiftExpectedDate,
  todayIn,
  unassigned,
  type Clock,
  type CategoryGroupKind,
  type IncomeCategoryFigures,
  type Period,
  type PlainDate,
  type PlanLineFigures,
  type PlanPeriodStatus,
} from '@mizan/domain'
import type { Db } from '../../db/client.ts'
import { uuidv7 } from '../../lib/uuid.ts'
import type { RequestAuth } from '../../plugins/auth.ts'
import { badRequest, conflict, notFound } from '../../plugins/errors.ts'
import {
  findCategories,
  findCategoryGroups,
  type CategoryGroupRow,
  type CategoryRow,
} from '../categories/repository.ts'
import { assertCanWrite } from '../workspace/service.ts'
import {
  deleteIncomeItem,
  deleteLine,
  findIncomeItemById,
  findIncomeItems,
  findLatestPlannedPeriodBefore,
  findLineByTarget,
  findLines,
  findPeriodByStart,
  insertIncomeItem,
  insertLine,
  insertPeriod,
  nextIncomeItemSortOrder,
  sumActualByCategory,
  updateIncomeItem,
  updateLine,
  type PlanIncomeItemRow,
  type PlanLineRow,
  type PlanPeriodRow,
} from './repository.ts'

/* ----------------------------------------------------------- the period */

interface ResolvedPeriod {
  /** The stored row, absent until the month is first edited. */
  row: PlanPeriodRow | undefined
  period: Period
  status: PlanPeriodStatus
  closedAt: Date | null
}

const toPeriod = (row: PlanPeriodRow): Period => ({
  start: row.startDate as PlainDate,
  end: row.endDate as PlainDate,
})

/**
 * Which month a request is about.
 *
 * A stored period is the authority on its own bounds, because the anchor can move: someone who
 * changes payday from the 1st to the 15th keeps the months they already planned exactly as they
 * planned them. Only a month that has never been touched is derived from the current anchor, and
 * then it must line up with it — an arbitrary date is a mistake, not a one-day budget.
 */
async function resolvePeriod(
  db: Db,
  auth: RequestAuth,
  clock: Clock,
  start: PlainDate | undefined,
): Promise<ResolvedPeriod> {
  const startDay = auth.workspace.periodStartDay

  if (start === undefined) {
    const period = periodContaining(todayIn(clock, auth.workspace.timezone), startDay)
    const row = await findPeriodByStart(db, auth.workspaceId, period.start)
    return row ? resolved(row) : { row: undefined, period, status: 'open', closedAt: null }
  }

  const row = await findPeriodByStart(db, auth.workspaceId, start)
  if (row) return resolved(row)

  const period = periodContaining(start, startDay)
  if (period.start !== start) {
    throw badRequest(`A plan month starts on day ${startDay}, so it cannot start on ${start}.`)
  }
  return { row: undefined, period, status: 'open', closedAt: null }
}

function resolved(row: PlanPeriodRow): ResolvedPeriod {
  return {
    row,
    period: toPeriod(row),
    // The `plan_periods_status_known` check keeps this in step with the domain.
    status: row.status as PlanPeriodStatus,
    closedAt: row.closedAt,
  }
}

/** Writes the period row the first time a month is planned, and returns it either way. */
async function ensurePeriodRow(
  db: Db,
  auth: RequestAuth,
  resolvedPeriod: ResolvedPeriod,
): Promise<PlanPeriodRow> {
  if (resolvedPeriod.row) return resolvedPeriod.row

  const inserted = await insertPeriod(db, {
    id: uuidv7(),
    workspaceId: auth.workspaceId,
    startDate: resolvedPeriod.period.start,
    endDate: resolvedPeriod.period.end,
  })
  if (inserted) return inserted

  // Another request created it between the read and the insert; its row is the answer.
  const existing = await findPeriodByStart(db, auth.workspaceId, resolvedPeriod.period.start)
  if (!existing) throw conflict('That month could not be opened. Try again.')
  return existing
}

function assertOpen(resolvedPeriod: ResolvedPeriod): void {
  if (resolvedPeriod.status === 'closed') {
    throw conflict('That month is closed. Reopen it before changing its plan.')
  }
}

/* ------------------------------------------------------- the read model */

/** A category with the kind of the group it sits in, which is what the plan reasons about. */
interface CategoryContext {
  row: CategoryRow
  kind: CategoryGroupKind
}

interface PlanData {
  groups: CategoryGroupRow[]
  categories: CategoryRow[]
  lines: PlanLineRow[]
  incomeItems: PlanIncomeItemRow[]
  /** Signed sums per category, `null` keyed for spending with no category at all. */
  actuals: Map<string | null, Money>
}

async function loadPlanData(
  db: Db,
  auth: RequestAuth,
  resolvedPeriod: ResolvedPeriod,
): Promise<PlanData> {
  const base = auth.workspace.baseCurrency
  const periodId = resolvedPeriod.row?.id

  const [groups, categories, lines, incomeItems, actualRows] = await Promise.all([
    findCategoryGroups(db, auth.workspaceId),
    // Archived categories are included: a line or last week's spending may still point at one,
    // and a plan that hid it would not add up.
    findCategories(db, auth.workspaceId, { includeArchived: true }),
    periodId ? findLines(db, auth.workspaceId, periodId) : Promise.resolve([]),
    periodId ? findIncomeItems(db, auth.workspaceId, periodId) : Promise.resolve([]),
    sumActualByCategory(db, auth.workspaceId, resolvedPeriod.period),
  ])

  return {
    groups,
    categories,
    lines,
    incomeItems,
    actuals: new Map(
      actualRows.map((row) => [row.categoryId, Money.of(row.total, base).roundToMinor()]),
    ),
  }
}

/**
 * Turns a period's rows into the plan the page renders (PLAN §10, §13).
 *
 * The shape follows one rule: every lira of on-budget spending is counted exactly once. A
 * flexible category with no line of its own is counted on the pool, a subcategory with no line
 * is counted on its parent, and both still show their own figure so the page can say where the
 * money went — but only rows that answer for themselves are added into a total.
 */
function buildPlan(
  auth: RequestAuth,
  resolvedPeriod: ResolvedPeriod,
  data: PlanData,
  today: PlainDate,
  copyableFrom: PlainDate | null,
): PlanResponse {
  const base = auth.workspace.baseCurrency
  const zero = Money.zero(base)
  const { period } = resolvedPeriod

  const groupById = new Map(data.groups.map((group) => [group.id, group]))
  const contextOf = (category: CategoryRow): CategoryContext | undefined => {
    const group = groupById.get(category.groupId)
    return group ? { row: category, kind: categoryGroupKind(group.kind) } : undefined
  }

  const lineByCategory = new Map(
    data.lines
      .filter((line): line is PlanLineRow & { categoryId: string } => line.categoryId !== null)
      .map((line) => [line.categoryId, line]),
  )
  const poolLine = data.lines.find((line) => line.isPool)

  /** A category's own spending: the signed ledger sum, read as money that left. */
  const ownSpending = (categoryId: string): Money => (data.actuals.get(categoryId) ?? zero).negate()

  const childrenOf = new Map<string, CategoryRow[]>()
  for (const category of data.categories) {
    if (category.parentId === null) continue
    const bucket = childrenOf.get(category.parentId)
    if (bucket) bucket.push(category)
    else childrenOf.set(category.parentId, [category])
  }

  /**
   * What a category's line answers for: its own spending plus every subcategory that has no line
   * of its own (§10). A subcategory with a line keeps its spending to itself.
   */
  const foldedSpending = (category: CategoryRow): Money =>
    Money.sum(
      [
        ownSpending(category.id),
        ...(childrenOf.get(category.id) ?? [])
          .filter((child) => !lineByCategory.has(child.id))
          .map((child) => ownSpending(child.id)),
      ],
      base,
    ).roundToMinor()

  const row = (
    category: CategoryRow,
    kind: CategoryGroupKind,
    { isChild }: { isChild: boolean },
  ): PlanChildRowDto => {
    const line = lineByCategory.get(category.id)
    const actual = foldedSpending(category)

    // Nothing covers a row that has its own line; without one, a subcategory falls to its parent
    // and a flexible category to the pool. Anything else is simply unplanned, and says so.
    const coveredBy = line ? null : isChild ? 'parent' : isPooledByDefault(kind) ? 'pool' : null

    const figures: PlanLineFigures = {
      planned: line ? Money.of(line.plannedAmount, base) : zero,
      carryIn: line ? Money.of(line.carryIn, base) : zero,
      actual,
    }

    return {
      lineId: line?.id ?? null,
      target: 'category',
      categoryId: category.id,
      planned: figures.planned.toDto(),
      carryIn: (figures.carryIn ?? zero).toDto(),
      actual: actual.toDto(),
      // A covered row's cover carries its remainder, so showing one here would count it twice.
      available: (coveredBy ? zero : planLineAvailable(figures)).toDto(),
      overspend: (coveredBy ? zero : planLineOverspend(figures)).toDto(),
      rollover: line?.rollover ?? false,
      coveredBy,
      sortOrder: category.sortOrder,
      version: line?.version ?? null,
    }
  }

  /** Spending the pool answers for: pooled categories, folded, plus what has no category. */
  const uncategorized = (data.actuals.get(null) ?? zero).negate()
  const pooledSpending = Money.sum(
    [
      uncategorized,
      ...data.categories
        .filter((category) => {
          if (category.parentId !== null || lineByCategory.has(category.id)) return false
          const context = contextOf(category)
          return context ? isPooledByDefault(context.kind) : false
        })
        .map(foldedSpending),
    ],
    base,
  ).roundToMinor()

  const poolFigures: PlanLineFigures = {
    planned: poolLine ? Money.of(poolLine.plannedAmount, base) : zero,
    carryIn: poolLine ? Money.of(poolLine.carryIn, base) : zero,
    actual: pooledSpending,
  }

  const poolRow: PlanRowDto = {
    lineId: poolLine?.id ?? null,
    target: 'pool',
    categoryId: null,
    planned: poolFigures.planned.toDto(),
    carryIn: (poolFigures.carryIn ?? zero).toDto(),
    actual: pooledSpending.toDto(),
    available: planLineAvailable(poolFigures).toDto(),
    overspend: planLineOverspend(poolFigures).toDto(),
    rollover: poolLine?.rollover ?? false,
    coveredBy: null,
    sortOrder: poolLine?.sortOrder ?? 0,
    version: poolLine?.version ?? null,
    children: [],
  }

  /* ------------------------------------------------------------ the groups */

  const spendingGroups = data.groups
    .filter((group) => categoryGroupKind(group.kind) !== 'income')
    .sort(
      (a, b) =>
        compareCategoryGroupKinds(categoryGroupKind(a.kind), categoryGroupKind(b.kind)) ||
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name),
    )

  const groups: PlanGroupDto[] = spendingGroups.map((group) => {
    const kind = categoryGroupKind(group.kind)
    const inGroup = data.categories.filter((category) => category.groupId === group.id)

    const rows: PlanRowDto[] = inGroup
      .filter((category) => category.parentId === null)
      .filter((category) => isVisible(category, lineByCategory, foldedSpending))
      .map((category) => ({
        ...row(category, kind, { isChild: false }),
        children: (childrenOf.get(category.id) ?? [])
          .filter((child) => isVisible(child, lineByCategory, foldedSpending))
          .map((child) => row(child, kind, { isChild: true })),
      }))

    return {
      id: group.id,
      kind,
      name: group.name,
      systemKey: group.systemKey,
      renamed: group.nameOverridden,
      sortOrder: group.sortOrder,
      rows,
      ...groupTotals(rows, base),
    }
  })

  groups.push({
    id: null,
    kind: 'pool',
    name: 'Available to spend',
    systemKey: 'pool',
    renamed: false,
    sortOrder: spendingGroups.length + 1,
    rows: [poolRow],
    ...groupTotals([poolRow], base),
  })

  /* ----------------------------------------------------------- the summary */

  const incomeItems = data.incomeItems.map((item) => toIncomeItemDto(item, data.actuals, base))
  const income = incomeFigures(data, groupById, base)

  const allocated = allocatedTotal(
    data.lines.map((line) => ({ planned: Money.of(line.plannedAmount, base) })),
    base,
  )
  const poolCarryIn = poolFigures.carryIn ?? zero
  const selfAnswering = groups.flatMap((group) => contributingRows(group.rows))

  const summary: PlanSummary = {
    income: income.total.toDto(),
    unplannedIncome: income.unplanned.toDto(),
    poolCarryIn: poolCarryIn.toDto(),
    allocated: allocated.toDto(),
    unassigned: unassigned({ income: income.total, poolCarryIn, allocated }).toDto(),
    spent: Money.sum(
      selfAnswering.map((one) => moneyFromDto(one.actual)),
      base,
    )
      .roundToMinor()
      .toDto(),
    overspend: Money.sum(
      selfAnswering.map((one) => moneyFromDto(one.overspend)),
      base,
    )
      .roundToMinor()
      .toDto(),
    uncategorizedSpending: uncategorized.toDto(),
  }

  return {
    period: {
      id: resolvedPeriod.row?.id ?? null,
      start: period.start,
      end: period.end,
      status: resolvedPeriod.status,
      closedAt: resolvedPeriod.closedAt?.toISOString() ?? null,
      previousStart: previousPeriod(period, auth.workspace.periodStartDay).start,
      // Periods never overlap or leave gaps, so the next one starts the day this one ends.
      nextStart: period.end,
      daysElapsed: daysElapsed(period, today),
      days: periodLength(period),
    },
    summary,
    groups,
    incomeItems,
    copyableFrom,
  }
}

/**
 * Whether a category earns a row.
 *
 * Live categories always do — the page is where money is assigned, so every one of them needs
 * somewhere to type. An archived category appears only while it still has an allocation or
 * something was spent on it this month; once both are gone it drops out of the plan for good.
 */
function isVisible(
  category: CategoryRow,
  lines: Map<string, PlanLineRow>,
  spending: (category: CategoryRow) => Money,
): boolean {
  if (category.archivedAt === null) return true
  return lines.has(category.id) || !spending(category).isZero()
}

/** The rows that answer for themselves: what a total may add up without counting twice. */
function contributingRows(rows: readonly PlanRowDto[]): PlanChildRowDto[] {
  return rows.flatMap((one) => [
    ...(one.coveredBy === null ? [one] : []),
    ...one.children.filter((child) => child.coveredBy === null),
  ])
}

function groupTotals(rows: readonly PlanRowDto[], currency: string) {
  const totals = planTotals(
    contributingRows(rows).map((one) => ({
      planned: moneyFromDto(one.planned),
      carryIn: moneyFromDto(one.carryIn),
      actual: moneyFromDto(one.actual),
    })),
    currency,
  )
  return {
    planned: totals.planned.toDto(),
    actual: totals.actual.toDto(),
    available: totals.available.toDto(),
    overspend: totals.overspend.toDto(),
  }
}

function toIncomeItemDto(
  item: PlanIncomeItemRow,
  actuals: Map<string | null, Money>,
  currency: string,
): PlanIncomeItemDto {
  return {
    id: item.id,
    categoryId: item.categoryId,
    label: item.label,
    expected: Money.of(item.expectedAmount, currency).toDto(),
    expectedDate: (item.expectedDate as PlainDate | null) ?? null,
    received: item.receivedAmount === null ? null : Money.of(item.receivedAmount, currency).toDto(),
    receivedAt: item.receivedAt?.toISOString() ?? null,
    categoryActual: (actuals.get(item.categoryId) ?? Money.zero(currency)).toDto(),
    sortOrder: item.sortOrder,
  }
}

/**
 * `I` and the part of it nobody planned for (§10).
 *
 * The comparison is per income category: a salary item expecting ₺46,000 stops counting its
 * expectation once ₺46,000 has actually arrived in that category, rather than adding to it. What
 * lands in a category no item claims is unplanned income, which is money to assign all the same.
 */
function incomeFigures(
  data: PlanData,
  groupById: Map<string, CategoryGroupRow>,
  currency: string,
): { total: Money; unplanned: Money } {
  const zero = Money.zero(currency)
  const incomeCategories = data.categories.filter((category) => {
    const group = groupById.get(category.groupId)
    return group ? categoryGroupKind(group.kind) === 'income' : false
  })

  const figuresByCategory = new Map<string, IncomeCategoryFigures>()
  for (const category of incomeCategories) {
    figuresByCategory.set(category.id, {
      expected: zero,
      received: zero,
      actual: data.actuals.get(category.id) ?? zero,
    })
  }

  for (const item of data.incomeItems) {
    const current = figuresByCategory.get(item.categoryId)
    // An item on a category that is not income any more still counts; its own figure is all
    // there is to go on.
    const figures = current ?? {
      expected: zero,
      received: zero,
      actual: data.actuals.get(item.categoryId) ?? zero,
    }
    figuresByCategory.set(item.categoryId, {
      actual: figures.actual,
      expected:
        item.receivedAmount === null
          ? figures.expected.plus(Money.of(item.expectedAmount, currency))
          : figures.expected,
      received:
        item.receivedAmount === null
          ? figures.received
          : figures.received.plus(Money.of(item.receivedAmount, currency)),
    })
  }

  const all = [...figuresByCategory.values()]
  const total = Money.sum(all.map(countedIncome), currency).roundToMinor()
  const planned = Money.sum(
    all.map((figures) => figures.received.plus(figures.expected)),
    currency,
  ).roundToMinor()

  return { total, unplanned: total.minus(planned).roundToMinor() }
}

/* ------------------------------------------------------------- reading */

export interface PlanDependencies {
  clock: Clock
}

async function readPlanFor(
  db: Db,
  auth: RequestAuth,
  clock: Clock,
  resolvedPeriod: ResolvedPeriod,
): Promise<PlanResponse> {
  const [data, previous] = await Promise.all([
    loadPlanData(db, auth, resolvedPeriod),
    findLatestPlannedPeriodBefore(db, auth.workspaceId, resolvedPeriod.period.start),
  ])

  return buildPlan(
    auth,
    resolvedPeriod,
    data,
    todayIn(clock, auth.workspace.timezone),
    (previous?.startDate as PlainDate | undefined) ?? null,
  )
}

/** `GET /plans/current` and `GET /plans/:start` (PLAN §12). */
export async function readPlan(
  db: Db,
  auth: RequestAuth,
  { clock }: PlanDependencies,
  start?: PlainDate,
): Promise<PlanResponse> {
  return readPlanFor(db, auth, clock, await resolvePeriod(db, auth, clock, start))
}

/* ------------------------------------------------------------- writing */

/** A category a line may point at: live, this workspace's, and not an income category. */
async function assertAllocatableCategory(
  db: Db,
  auth: RequestAuth,
  categoryId: string,
): Promise<CategoryRow> {
  const [categories, groups] = await Promise.all([
    findCategories(db, auth.workspaceId, { includeArchived: true }),
    findCategoryGroups(db, auth.workspaceId),
  ])

  const category = categories.find((one) => one.id === categoryId)
  // Another workspace's id is indistinguishable from one that does not exist.
  if (!category) throw notFound('No such category.')
  if (category.archivedAt) throw conflict('That category is archived.')

  const group = groups.find((one) => one.id === category.groupId)
  if (group && categoryGroupKind(group.kind) === 'income') {
    throw badRequest('Income is planned as expected income, not as an allocation.')
  }
  return category
}

/**
 * Sets an allocation, creating the line if the target has none (flow F3).
 *
 * Zero removes the line rather than storing it: a flexible category with no line is covered by
 * the pool and a subcategory with no line by its parent (§10), which is what a user clearing an
 * amount means. Writing the row would instead leave the category planned at nothing, and every
 * lira spent on it would read as an overspend.
 */
export async function upsertPlanLine(
  db: Db,
  auth: RequestAuth,
  { clock }: PlanDependencies,
  start: PlainDate | undefined,
  input: UpsertPlanLineInput,
): Promise<PlanResponse> {
  assertCanWrite(auth)

  const resolvedPeriod = await resolvePeriod(db, auth, clock, start)
  assertOpen(resolvedPeriod)

  const planned = moneyFromDto(input.planned)
  if (planned.currency !== auth.workspace.baseCurrency) {
    throw badRequest(`Allocations must be in ${auth.workspace.baseCurrency}.`)
  }

  const category =
    input.categoryId === undefined
      ? undefined
      : await assertAllocatableCategory(db, auth, input.categoryId)

  const periodRow = await ensurePeriodRow(db, auth, resolvedPeriod)
  const existing = await findLineByTarget(db, auth.workspaceId, periodRow.id, {
    categoryId: category?.id ?? null,
  })

  if (existing) {
    if (input.version !== undefined && input.version !== existing.version) {
      throw conflict('That amount changed somewhere else. Reload the plan and try again.')
    }

    if (planned.isZero() && !(input.rollover ?? existing.rollover)) {
      await deleteLine(db, auth.workspaceId, existing.id)
    } else {
      const updated = await updateLine(
        db,
        auth.workspaceId,
        existing.id,
        {
          plannedAmount: planned.roundToMinor().toDto().amount,
          ...(input.rollover === undefined ? {} : { rollover: input.rollover }),
        },
        input.version,
      )
      if (!updated) {
        throw conflict('That amount changed somewhere else. Reload the plan and try again.')
      }
    }
  } else if (!planned.isZero() || input.rollover) {
    await insertLine(db, {
      id: uuidv7(),
      workspaceId: auth.workspaceId,
      periodId: periodRow.id,
      categoryId: category?.id ?? null,
      isPool: input.target === 'pool',
      plannedAmount: planned.roundToMinor().toDto().amount,
      rollover: input.rollover ?? false,
      // The pool sits below every category group, where the Plan page shows it.
      sortOrder: category?.sortOrder ?? 9999,
    })
  }

  return readPlanFor(db, auth, clock, { ...resolvedPeriod, row: periodRow })
}

async function assertIncomeCategory(
  db: Db,
  auth: RequestAuth,
  categoryId: string,
): Promise<CategoryRow> {
  const [categories, groups] = await Promise.all([
    findCategories(db, auth.workspaceId, { includeArchived: true }),
    findCategoryGroups(db, auth.workspaceId),
  ])

  const category = categories.find((one) => one.id === categoryId)
  if (!category) throw notFound('No such category.')
  if (category.archivedAt) throw conflict('That category is archived.')

  const group = groups.find((one) => one.id === category.groupId)
  if (!group || categoryGroupKind(group.kind) !== 'income') {
    throw badRequest('Expected income has to sit in an income category.')
  }
  return category
}

/** Adds expected income to a period (flow F3). Idempotent on a client-supplied id (§12). */
export async function createIncomeItem(
  db: Db,
  auth: RequestAuth,
  { clock }: PlanDependencies,
  start: PlainDate | undefined,
  input: CreatePlanIncomeItemInput,
): Promise<{ plan: PlanResponse; created: boolean }> {
  assertCanWrite(auth)

  const resolvedPeriod = await resolvePeriod(db, auth, clock, start)
  assertOpen(resolvedPeriod)

  const expected = moneyFromDto(input.expected)
  if (expected.currency !== auth.workspace.baseCurrency) {
    throw badRequest(`Expected income must be in ${auth.workspace.baseCurrency}.`)
  }
  await assertIncomeCategory(db, auth, input.categoryId)

  const id = input.id ?? uuidv7()
  const existing = await findIncomeItemById(db, auth.workspaceId, id)
  if (existing) {
    return { plan: await readPlanFor(db, auth, clock, resolvedPeriod), created: false }
  }

  const periodRow = await ensurePeriodRow(db, auth, resolvedPeriod)
  if (input.expectedDate && !isInside(resolvedPeriod.period, input.expectedDate)) {
    throw badRequest('That date is outside the month being planned.')
  }

  await insertIncomeItem(db, {
    id,
    workspaceId: auth.workspaceId,
    periodId: periodRow.id,
    categoryId: input.categoryId,
    label: input.label?.trim() ? input.label.trim() : null,
    expectedAmount: expected.roundToMinor().toDto().amount,
    expectedDate: input.expectedDate ?? null,
    sortOrder: await nextIncomeItemSortOrder(db, auth.workspaceId, periodRow.id),
  })

  return {
    plan: await readPlanFor(db, auth, clock, { ...resolvedPeriod, row: periodRow }),
    created: true,
  }
}

const isInside = (period: Period, date: PlainDate): boolean =>
  date >= period.start && date < period.end

/**
 * Edits expected income. Setting `received` is the moment the plan stops guessing: from then on
 * the confirmed amount is what counts, which is how a short salary shows up as over-allocated
 * rather than as money that is still coming (flow F2).
 */
export async function patchIncomeItem(
  db: Db,
  auth: RequestAuth,
  { clock }: PlanDependencies,
  start: PlainDate | undefined,
  id: string,
  input: UpdatePlanIncomeItemInput,
): Promise<PlanResponse> {
  assertCanWrite(auth)

  const resolvedPeriod = await resolvePeriod(db, auth, clock, start)
  const item = await findIncomeItemById(db, auth.workspaceId, id)
  if (!item || item.periodId !== resolvedPeriod.row?.id) throw notFound('No such income item.')
  assertOpen(resolvedPeriod)

  if (input.categoryId !== undefined) await assertIncomeCategory(db, auth, input.categoryId)
  if (
    input.expectedDate !== undefined &&
    input.expectedDate !== null &&
    !isInside(resolvedPeriod.period, input.expectedDate)
  ) {
    throw badRequest('That date is outside the month being planned.')
  }

  const amount = (value: MoneyDto) => {
    const money = moneyFromDto(value)
    if (money.currency !== auth.workspace.baseCurrency) {
      throw badRequest(`Amounts must be in ${auth.workspace.baseCurrency}.`)
    }
    return money.roundToMinor().toDto().amount
  }

  const updated = await updateIncomeItem(db, auth.workspaceId, id, {
    ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
    ...(input.label === undefined ? {} : { label: input.label?.trim() || null }),
    ...(input.expected === undefined ? {} : { expectedAmount: amount(input.expected) }),
    ...(input.expectedDate === undefined ? {} : { expectedDate: input.expectedDate }),
    ...(input.received === undefined
      ? {}
      : input.received === null
        ? { receivedAmount: null, receivedAt: null }
        : { receivedAmount: amount(input.received), receivedAt: new Date() }),
  })
  if (!updated) throw notFound('No such income item.')

  return readPlanFor(db, auth, clock, resolvedPeriod)
}

export async function removeIncomeItem(
  db: Db,
  auth: RequestAuth,
  { clock }: PlanDependencies,
  start: PlainDate | undefined,
  id: string,
): Promise<PlanResponse> {
  assertCanWrite(auth)

  const resolvedPeriod = await resolvePeriod(db, auth, clock, start)
  const item = await findIncomeItemById(db, auth.workspaceId, id)
  if (!item || item.periodId !== resolvedPeriod.row?.id) throw notFound('No such income item.')
  assertOpen(resolvedPeriod)

  await deleteIncomeItem(db, auth.workspaceId, id)
  return readPlanFor(db, auth, clock, resolvedPeriod)
}

/**
 * Copies an earlier month's plan into this one (flow F3).
 *
 * Only the allocations that are missing are written, so running it twice — or running it after
 * typing an amount — can never overwrite what is already there. Income items are copied only
 * into a month that has none, because two salaries in one month is a worse outcome than none.
 */
export async function copyPlan(
  db: Db,
  auth: RequestAuth,
  { clock }: PlanDependencies,
  start: PlainDate | undefined,
  from: PlainDate,
  input: CopyPlanInput,
): Promise<CopyPlanResponse> {
  assertCanWrite(auth)

  const target = await resolvePeriod(db, auth, clock, start)
  assertOpen(target)

  const sourceRow = await findPeriodByStart(db, auth.workspaceId, from)
  if (!sourceRow) throw notFound('There is no plan for that month to copy.')
  if (sourceRow.startDate === target.period.start) {
    throw badRequest('A month cannot be copied onto itself.')
  }

  const source = resolved(sourceRow)
  const [sourceLines, sourceIncome] = await Promise.all([
    findLines(db, auth.workspaceId, sourceRow.id),
    findIncomeItems(db, auth.workspaceId, sourceRow.id),
  ])
  if (sourceLines.length === 0 && sourceIncome.length === 0) {
    throw badRequest('That month has nothing to copy.')
  }

  const periodRow = await ensurePeriodRow(db, auth, target)
  const existing = await findLines(db, auth.workspaceId, periodRow.id)
  const taken = new Set(existing.map((line) => line.categoryId ?? 'pool'))

  const toCopy = sourceLines.filter((line) => !taken.has(line.categoryId ?? 'pool'))
  const includeIncome =
    (input.includeIncome ?? true) &&
    sourceIncome.length > 0 &&
    (await findIncomeItems(db, auth.workspaceId, periodRow.id)).length === 0

  await db.transaction(async (tx) => {
    for (const line of toCopy) {
      await insertLine(tx, {
        id: uuidv7(),
        workspaceId: auth.workspaceId,
        periodId: periodRow.id,
        categoryId: line.categoryId,
        isPool: line.isPool,
        plannedAmount: line.plannedAmount,
        rollover: line.rollover,
        sortOrder: line.sortOrder,
      })
    }

    if (includeIncome) {
      for (const item of sourceIncome) {
        await insertIncomeItem(tx, {
          id: uuidv7(),
          workspaceId: auth.workspaceId,
          periodId: periodRow.id,
          categoryId: item.categoryId,
          label: item.label,
          // What was expected, not what arrived: next month's salary is a fresh expectation.
          expectedAmount: item.expectedAmount,
          expectedDate: item.expectedDate
            ? shiftExpectedDate(item.expectedDate as PlainDate, source.period, target.period)
            : null,
          sortOrder: item.sortOrder,
        })
      }
    }
  })

  return {
    plan: await readPlanFor(db, auth, clock, { ...target, row: periodRow }),
    copiedLines: toCopy.length,
    copiedIncomeItems: includeIncome ? sourceIncome.length : 0,
    skippedLines: sourceLines.length - toCopy.length,
  }
}
