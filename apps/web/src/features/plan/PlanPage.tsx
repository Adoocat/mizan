import {
  moneyFromDto,
  type PlanChildRowDto,
  type PlanGroupDto,
  type PlanResponse,
  type UpsertPlanLineInput,
} from '@mizan/contracts'
import { decimal, Money, unassigned, type Decimal } from '@mizan/domain'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import { PercentText } from '../../components/finance/PercentText'
import { ProgressBar } from '../../components/finance/Progress'
import { PageContainer, PageHeader } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { FormError } from '../../components/ui/Field'
import { Panel } from '../../components/ui/Panel'
import { Skeleton } from '../../components/ui/Skeleton'
import { toast } from '../../components/ui/Toaster'
import { cn } from '../../lib/cn'
import { useFormatPeriod, useFormatShortMonth } from '../../lib/format-date'
import { useCurrentSession } from '../auth/session'
import { useCategories } from '../categories/api'
import { optionsById, useCategoryGroupName, useCategoryOptions } from '../categories/names'
import { useCopyPlan, useCoverOverspend, usePlan, useUndoCover, useUpsertPlanLine } from './api'
import { CoverDialog, coverSources } from './CoverDialog'
import { IncomePanel } from './IncomePanel'
import { planGridClass, PlanLineRow } from './PlanLineRow'
import { SafeToSpend } from './SafeToSpend'
import { planSearchSchema, type PlanSearch } from './search'

/** Reads the month from the URL, which is where it lives (§13). */
function usePlanSearch(): PlanSearch {
  // The router types `location.search` as `any`; the schema is what gives it a shape.
  const raw: unknown = useRouterState({ select: (state): unknown => state.location.search })
  return planSearchSchema.parse(raw ?? {})
}

/** The colour each group's slice of the allocation bar takes, by group kind. */
const GROUP_COLOURS: Record<PlanGroupDto['kind'], string> = {
  income: 'bg-data-essentials',
  essential: 'bg-data-essentials',
  flexible: 'bg-data-flexible',
  debt: 'bg-data-debt',
  savings: 'bg-data-savings',
  investment: 'bg-data-investments',
  pool: 'bg-data-pool',
}

/** Every row of the plan, parents and subcategories alike, in the order they are shown. */
function allRows(plan: PlanResponse): PlanChildRowDto[] {
  return plan.groups.flatMap((group) => group.rows.flatMap((row) => [row, ...row.children]))
}

const rowKey = (row: PlanChildRowDto): string => row.categoryId ?? 'pool'

/** A ratio for a progress bar, with nothing to divide by treated as nothing used. */
function share(part: Money, whole: Money): Decimal {
  return whole.isZero() ? decimal(0) : part.amount.dividedBy(whole.amount)
}

export function PlanPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const session = useCurrentSession()
  const { month } = usePlanSearch()
  const start = month ?? null

  const plan = usePlan(start)
  const categories = useCategories(true)
  const options = useCategoryOptions(categories.data)
  const namesById = optionsById(options)
  const groupName = useCategoryGroupName()
  const formatPeriod = useFormatPeriod()
  const shortMonth = useFormatShortMonth()

  const upsert = useUpsertPlanLine(start)
  const copy = useCopyPlan(start)
  const cover = useCoverOverspend(start)
  const undoCover = useUndoCover(start)

  /** Amounts being typed, by row, applied over the stored ones until they are saved. */
  const [drafts, setDrafts] = useState<Record<string, Money | null>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  /** The overspent row the Cover dialog is open for. */
  const [coveringKey, setCoveringKey] = useState<string | null>(null)

  const clearDraft = (key: string) =>
    setDrafts((current) =>
      Object.fromEntries(Object.entries(current).filter(([other]) => other !== key)),
    )

  if (plan.isPending || categories.isPending) {
    return (
      <PageContainer>
        <PageHeader eyebrow={t('plan.eyebrow')} title={t('plan.title')} />
        <div className="grid gap-5 md:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-32 rounded-card" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-card" />
      </PageContainer>
    )
  }

  if (plan.error || !plan.data) {
    return (
      <PageContainer>
        <PageHeader eyebrow={t('plan.eyebrow')} title={t('plan.title')} />
        <FormError>{plan.error?.message ?? t('plan.loadFailed')}</FormError>
      </PageContainer>
    )
  }

  const data = plan.data
  const currency = session.workspace.baseCurrency
  const zero = Money.zero(currency)
  const editable = data.period.status === 'open' && session.workspace.role !== 'viewer'

  const income = moneyFromDto(data.summary.income)
  const poolCarryIn = moneyFromDto(data.summary.poolCarryIn)

  /*
   * Allocated and left-to-allocate are recomputed from the rows with whatever is being typed
   * applied, so the three tiles and the bar move with the keystrokes (the mockup: "Totals, the
   * bar and today's safe-to-spend update as you type"). The saved figures come straight from the
   * API, which stays the authority.
   */
  const plannedOf = (row: PlanChildRowDto): Money => {
    const draft = drafts[rowKey(row)]
    // A draft of `null` is an emptied field, which allocates nothing — not the stored amount.
    return draft === undefined ? moneyFromDto(row.planned) : (draft ?? zero)
  }
  const rows = allRows(data)
  const allocated = Money.sum(rows.map(plannedOf), currency)
  const left = unassigned({ income, poolCarryIn, allocated })
  const editing = Object.keys(drafts).length > 0

  /*
   * A group's allocation counts the rows that answer for themselves — the pool and parent
   * categories carry the rest, and counting those twice would overstate the plan — plus any row
   * that is being given a line right now, so the total moves with the keystrokes.
   */
  const groupPlanned = (group: PlanGroupDto): Money =>
    Money.sum(
      group.rows
        .flatMap((row) => [row, ...row.children])
        .filter((row) => row.coveredBy === null || drafts[rowKey(row)] !== undefined)
        .map(plannedOf),
      currency,
    )

  const pace = decimal(data.period.daysElapsed).dividedBy(data.period.days)

  function commit(row: PlanChildRowDto) {
    const key = rowKey(row)
    const draft = drafts[key]
    if (draft === undefined) return

    const stored = moneyFromDto(row.planned)
    // An unparseable or emptied field means "no allocation", which is zero.
    const planned = draft ?? zero
    if (planned.equals(stored)) {
      clearDraft(key)
      return
    }

    const input: UpsertPlanLineInput = {
      ...(row.target === 'pool'
        ? { target: 'pool' as const }
        : { target: 'category' as const, categoryId: row.categoryId! }),
      planned: planned.toDto(),
      ...(row.version === null ? {} : { version: row.version }),
    }

    setSavingKey(key)
    upsert.mutate(input, {
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : t('plan.saveFailed')),
      onSettled: () => {
        setSavingKey(null)
        clearDraft(key)
      },
    })
  }

  const covering =
    coveringKey === null
      ? undefined
      : rows.find((row) => rowKey(row) === coveringKey && !moneyFromDto(row.overspend).isZero())

  /** Undo for the cover recorded against a row, when there is one to undo. */
  const undoCoverFor = (row: PlanChildRowDto): (() => void) | undefined => {
    const last = data.moves.filter((move) => move.toLineId === row.lineId).at(-1)
    if (!last) return undefined
    return () =>
      undoCover.mutate(last.id, {
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : t('cover.undoFailed')),
      })
  }

  const label = (row: PlanChildRowDto): string =>
    row.target === 'pool'
      ? t('plan.poolLine')
      : (namesById.get(row.categoryId ?? '')?.label ?? t('plan.uncategorized'))

  const tiles = [
    {
      key: 'income',
      value: income,
      note: t('plan.incomeNote', { count: data.incomeItems.length }),
    },
    {
      key: 'allocated',
      value: allocated,
      note: t('plan.allocatedNote', {
        percent: income.isZero() ? '0' : share(allocated, income).times(100).toFixed(0),
      }),
    },
    {
      key: 'left',
      value: left,
      note: left.isZero()
        ? t('plan.leftNote')
        : left.isNegative()
          ? t('plan.overAllocated')
          : t('plan.readyToAssign'),
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        eyebrow={t('plan.eyebrow')}
        title={t('plan.title')}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              aria-label={t('plan.previousMonth')}
              onClick={() => {
                void navigate({ to: '/plan', search: { month: data.period.previousStart } })
              }}
            >
              ‹ {shortMonth(data.period.previousStart)}
            </Button>
            <span className="px-1 text-body font-medium whitespace-nowrap text-ink">
              {formatPeriod(data.period.start, data.period.end)}
            </span>
            <Button
              size="sm"
              aria-label={t('plan.nextMonth')}
              onClick={() => {
                void navigate({ to: '/plan', search: { month: data.period.nextStart } })
              }}
            >
              {shortMonth(data.period.nextStart)} ›
            </Button>
            {editable && data.copyableFrom && (
              <Button
                variant="secondary"
                loading={copy.isPending}
                onClick={() => {
                  const from = data.copyableFrom
                  if (!from) return
                  copy.mutate(
                    { from },
                    {
                      onSuccess: (result) =>
                        toast.success(
                          t('plan.copied', {
                            count: result.copiedLines,
                            month: shortMonth(from),
                          }),
                        ),
                      onError: (error) =>
                        toast.error(error instanceof Error ? error.message : t('plan.copyFailed')),
                    },
                  )
                }}
              >
                {t('plan.copyFrom', { month: shortMonth(data.copyableFrom) })}
              </Button>
            )}
          </div>
        }
      />

      {data.period.status === 'closed' && <Badge tone="neutral">{t('plan.closedMonth')}</Badge>}

      <SafeToSpend plan={data} />

      <div className="grid gap-5 md:grid-cols-3">
        {tiles.map((tile) => (
          <section
            key={tile.key}
            aria-label={t(`plan.totals.${tile.key}`)}
            className="flex flex-col gap-2 rounded-card border border-transparent bg-surface p-7"
          >
            <h2 className="m-0 text-label font-normal text-ink-3">
              {t(`plan.totals.${tile.key}`)}
            </h2>
            <span className="text-panel-value text-ink">
              <MoneyText
                value={tile.value}
                fractionDigits="none"
                tone={tile.key === 'left' ? 'overspent' : 'neutral'}
              />
            </span>
            <p className="m-0 text-caption text-ink-2">{tile.note}</p>
            {tile.key === 'left' && tile.value.isZero() && !income.isZero() && (
              <Badge tone="positive">{t('showcase.badge.fullyAllocated')}</Badge>
            )}
          </section>
        ))}
      </div>

      <Panel
        title={t('plan.allocation')}
        meta={editing ? t('plan.allocationLive') : t('plan.allocationNote')}
      >
        <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {data.groups.map((group) => (
            <span
              key={group.kind}
              className={GROUP_COLOURS[group.kind]}
              style={{
                width: `${share(groupPlanned(group), allocated).times(100).toDecimalPlaces(2).toFixed()}%`,
              }}
            />
          ))}
        </div>
        <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-5">
          {data.groups.map((group) => (
            <div key={group.kind} className="flex flex-col gap-1.5">
              <dt className="flex items-center gap-2 text-label text-ink-2">
                <span
                  aria-hidden
                  className={cn('size-2 rounded-[2px]', GROUP_COLOURS[group.kind])}
                />
                {group.kind === 'pool' ? t('plan.poolLine') : groupName(group)}
              </dt>
              <dd className="m-0 text-value-s text-ink">
                <MoneyText value={groupPlanned(group)} fractionDigits="none" />
              </dd>
              <dd className="m-0 text-caption text-ink-3">
                <PercentText value={share(groupPlanned(group), income)} fractionDigits={0} />{' '}
                {t('plan.ofIncome')}
              </dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title={t('plan.categories')} meta={editable ? t('plan.editHint') : undefined} flush>
        <div className="flex flex-col">
          <div
            className={cn(
              planGridClass,
              'border-b border-divider px-7 pb-2 text-caption font-medium text-ink-3',
            )}
          >
            <span>{t('plan.columns.category')}</span>
            <span className="text-right">{t('plan.columns.budgeted')}</span>
            <span className="text-right">{t('plan.columns.spent')}</span>
            <span className="text-right">{t('plan.columns.remaining')}</span>
          </div>

          {data.groups.map((group) => {
            const planned = groupPlanned(group)
            const actual = moneyFromDto(group.actual)
            return (
              <div key={group.kind} className="flex flex-col">
                <div
                  className={cn(planGridClass, 'mt-4 items-center px-7 py-2 text-body font-medium')}
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className={cn('size-2 rounded-[2px]', GROUP_COLOURS[group.kind])}
                    />
                    {group.kind === 'pool' ? t('plan.poolLine') : groupName(group)}
                  </span>
                  <span className="text-right">
                    <MoneyText value={planned} fractionDigits="none" />
                  </span>
                  <span className="text-right">
                    <MoneyText value={actual} fractionDigits="none" />
                  </span>
                  <span className="text-right">
                    <MoneyText
                      value={planned.minus(actual)}
                      tone="overspent"
                      fractionDigits="none"
                    />
                  </span>
                </div>

                {group.rows.flatMap((row) => [
                  <PlanLineRow
                    key={rowKey(row)}
                    row={row}
                    name={label(row)}
                    pace={pace}
                    draft={drafts[rowKey(row)]}
                    disabled={!editable}
                    saving={savingKey === rowKey(row)}
                    onDraft={(value) =>
                      setDrafts((current) => ({ ...current, [rowKey(row)]: value }))
                    }
                    onCommit={() => commit(row)}
                    onRevert={() => clearDraft(rowKey(row))}
                    onCover={() => setCoveringKey(rowKey(row))}
                    onUndoCover={undoCoverFor(row)}
                  />,
                  ...row.children.map((child) => (
                    <PlanLineRow
                      key={rowKey(child)}
                      row={child}
                      name={label(child)}
                      pace={pace}
                      indented
                      draft={drafts[rowKey(child)]}
                      disabled={!editable}
                      saving={savingKey === rowKey(child)}
                      onDraft={(value) =>
                        setDrafts((current) => ({ ...current, [rowKey(child)]: value }))
                      }
                      onCommit={() => commit(child)}
                      onRevert={() => clearDraft(rowKey(child))}
                      onCover={() => setCoveringKey(rowKey(child))}
                      onUndoCover={undoCoverFor(child)}
                    />
                  )),
                ])}
              </div>
            )
          })}
        </div>
      </Panel>

      <div className="flex flex-wrap gap-5">
        <AllocationMix groups={data.groups} income={income} plannedOf={groupPlanned} />
        <IncomePanel
          plan={data}
          options={options.filter((option) => option.groupKind === 'income' && !option.archived)}
          namesById={namesById}
          editable={editable}
        />
      </div>

      {covering && (
        <CoverDialog
          key={coveringKey}
          open
          onOpenChange={(next) => setCoveringKey(next ? coveringKey : null)}
          target={covering}
          targetName={label(covering)}
          sources={coverSources(data, covering, label)}
          pending={cover.isPending}
          onSubmit={(input) =>
            cover.mutate(input, {
              onSuccess: () => {
                setCoveringKey(null)
                toast.success(t('cover.done'))
              },
              onError: (error) =>
                toast.error(error instanceof Error ? error.message : t('cover.failed')),
            })
          }
        />
      )}

      {!moneyFromDto(data.summary.uncategorizedSpending).isZero() && (
        <p className="m-0 text-caption text-ink-3">
          {t('plan.uncategorizedNote')}{' '}
          <MoneyText value={moneyFromDto(data.summary.uncategorizedSpending)} />
        </p>
      )}
    </PageContainer>
  )
}

const MIX_ROWS = [
  { key: 'needs', kinds: ['essential', 'debt'], guideline: '0.5' },
  { key: 'wants', kinds: ['flexible', 'pool'], guideline: '0.3' },
  { key: 'future', kinds: ['savings', 'investment'], guideline: '0.2' },
] as const

/** Needs / wants / future against the common 50-30-20 guideline (§16). */
function AllocationMix({
  groups,
  income,
  plannedOf,
}: {
  groups: PlanGroupDto[]
  income: Money
  plannedOf: (group: PlanGroupDto) => Money
}) {
  const { t } = useTranslation()

  return (
    <Panel title={t('plan.mix')} meta={t('plan.mixNote')} className="flex-[1.2] basis-[26rem]">
      <div className="flex flex-col gap-5">
        {MIX_ROWS.map((row) => {
          const planned = Money.sum(
            groups
              .filter((group) => (row.kinds as readonly string[]).includes(group.kind))
              .map(plannedOf),
            income.currency,
          )
          const value = share(planned, income)

          return (
            <div key={row.key} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-body">
                <span className="text-ink">{t(`plan.mixRows.${row.key}`)}</span>
                <span className="text-ink-2">
                  <PercentText value={value} fractionDigits={1} />
                  <span className="text-ink-3">
                    {' · '}
                    {t('plan.guideline')}{' '}
                    <PercentText value={decimal(row.guideline)} fractionDigits={0} />
                  </span>
                </span>
              </div>
              <ProgressBar
                value={value}
                marker={decimal(row.guideline)}
                tone="accent"
                label={t(`plan.mixRows.${row.key}`)}
              />
              <p className="m-0 text-caption text-ink-3">{t(`plan.mixDesc.${row.key}`)}</p>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
