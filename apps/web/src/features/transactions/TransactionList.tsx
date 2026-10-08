import { moneyFromDto, type AccountDto, type TransactionDto } from '@mizan/contracts'
import { Money, type PlainDate } from '@mizan/domain'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import { Badge } from '../../components/ui/Badge'
import { cn } from '../../lib/cn'
import { useFormatDate } from '../../lib/format-date'
import type { CategoryOption } from '../categories/names'

const ROW_GRID =
  'grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_110px] gap-x-3 md:grid-cols-[minmax(160px,1.8fr)_minmax(140px,1.2fr)_minmax(100px,0.9fr)_120px]'

/** The kinds a user edits here. The other two are changed where they were created (§7). */
const EDITABLE_TYPES = new Set<TransactionDto['type']>(['expense', 'income', 'transfer'])

/** A day's worth of transactions, with what the day cost. */
interface Day {
  date: PlainDate
  rows: TransactionDto[]
  total: Money
}

/**
 * Groups the page into days, newest first (the Transactions mockup).
 *
 * The API returns the rows already ordered, so this only has to break them where the date
 * changes. The day total is a plain sum of what the transactions did to the accounts — a transfer
 * contributes nothing, because its two legs cancel.
 */
export function groupByDay(transactions: readonly TransactionDto[], baseCurrency: string): Day[] {
  const days: Day[] = []
  for (const transaction of transactions) {
    const last = days.at(-1)
    if (last && last.date === transaction.date) last.rows.push(transaction)
    else days.push({ date: transaction.date, rows: [transaction], total: Money.zero(baseCurrency) })
  }
  return days.map((day) => ({
    ...day,
    total: Money.sum(
      day.rows.map((row) => moneyFromDto(row.total)),
      baseCurrency,
    ),
  }))
}

/** The dot colour per group kind, from the data palette (design system 2.0 §03). */
const KIND_DOTS: Record<CategoryOption['groupKind'], string> = {
  income: 'bg-positive-bar',
  essential: 'bg-data-essentials',
  flexible: 'bg-data-flexible',
  debt: 'bg-data-debt',
  savings: 'bg-data-savings',
  investment: 'bg-data-investments',
}

function CategoryCell({
  transaction,
  categories,
  onBudget,
}: {
  transaction: TransactionDto
  categories: Map<string, CategoryOption>
  onBudget: boolean
}) {
  const { t } = useTranslation()

  if (transaction.type === 'transfer') {
    return <span className="truncate text-body text-ink-3">{t('transactions.kinds.transfer')}</span>
  }
  if (transaction.lines.length > 1) {
    return (
      <span className="truncate text-body text-ink-2">
        {t('transactions.split', { count: transaction.lines.length })}
      </span>
    )
  }

  const categoryId = transaction.lines[0]?.categoryId
  const category = categoryId ? categories.get(categoryId) : undefined

  if (!category) {
    // Only money the plan has to account for can need a category (§10).
    const reviewable = onBudget && (transaction.type === 'expense' || transaction.type === 'income')
    return reviewable ? (
      <Badge tone="warning">{t('transactions.needsReview')}</Badge>
    ) : (
      <span className="text-body text-ink-3">—</span>
    )
  }

  return (
    <span className="flex items-center gap-2 truncate text-body text-ink-2">
      <span
        aria-hidden
        className={cn('size-1.5 flex-none rounded-full', KIND_DOTS[category.groupKind])}
      />
      <span className="truncate">{category.label}</span>
    </span>
  )
}

/**
 * The transaction table: day-grouped rows, a split expanded in place, and a click to edit.
 *
 * Every row is a button rather than a link — editing happens in a dialog over the list, so the
 * filters and the scroll position survive it.
 */
export function TransactionList({
  transactions,
  accounts,
  categories,
  onEdit,
  onDelete,
  baseCurrency,
}: {
  transactions: readonly TransactionDto[]
  accounts: Map<string, AccountDto>
  categories: Map<string, CategoryOption>
  onEdit: (transaction: TransactionDto) => void
  onDelete: (transaction: TransactionDto) => void
  baseCurrency: string
}) {
  const { t } = useTranslation()
  const formatDate = useFormatDate()
  const [expanded, setExpanded] = useState<string | null>(null)

  const days = groupByDay(transactions, baseCurrency)

  const describe = (transaction: TransactionDto): string => {
    if (transaction.payee) return transaction.payee
    if (transaction.type === 'transfer') {
      const from = accounts.get(transaction.lines[0]?.accountId ?? '')
      const to = accounts.get(transaction.lines[1]?.accountId ?? '')
      return t('transactions.transferBetween', {
        from: from?.name ?? '—',
        to: to?.name ?? '—',
      })
    }
    return t(`transactions.types.${transaction.type}`, {
      defaultValue: t('transactions.untitled'),
    })
  }

  return (
    <div className="flex flex-col">
      <div
        className={`${ROW_GRID} border-b border-divider px-7 pb-2 text-caption font-medium text-ink-3`}
      >
        <span>{t('transactions.columns.merchant')}</span>
        <span>{t('transactions.columns.category')}</span>
        <span className="hidden md:block">{t('transactions.columns.account')}</span>
        <span className="text-right">{t('transactions.columns.amount')}</span>
      </div>

      {days.map((day) => (
        <section key={day.date} aria-label={formatDate(day.date)}>
          <div className="flex items-center justify-between px-7 pt-5 pb-1">
            <h3 className="m-0 text-label font-medium text-ink-2">{formatDate(day.date)}</h3>
            <span className="text-caption text-ink-3">
              <MoneyText value={day.total} tone="signed" signDisplay="auto" />
            </span>
          </div>

          <ul className="m-0 flex list-none flex-col p-0">
            {day.rows.map((transaction) => {
              const account = accounts.get(transaction.lines[0]?.accountId ?? '')
              const isSplit = transaction.lines.length > 1
              const open = expanded === transaction.id
              /*
               * An opening balance changes with the account's opening balance, and a
               * reconciliation adjustment by reconciling again — the API refuses to edit either
               * (§7), so neither is offered as a button here. An opening balance cannot be
               * deleted at all; deleting the account is what removes it.
               */
              const editable = EDITABLE_TYPES.has(transaction.type)
              const deletable = transaction.type !== 'opening_balance'
              const Row = editable ? 'button' : 'div'

              return (
                <li key={transaction.id} className="flex flex-col">
                  <div className="group mx-3 flex items-center rounded-control hover:bg-inset">
                    <Row
                      {...(editable
                        ? { type: 'button' as const, onClick: () => onEdit(transaction) }
                        : {})}
                      className={cn(
                        ROW_GRID,
                        'min-w-0 flex-1 items-center bg-transparent px-4 py-3 text-left',
                        editable && 'cursor-pointer',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-body text-ink">{describe(transaction)}</span>
                        {isSplit && (
                          <span className="flex-none rounded-control border border-border px-1.5 text-caption text-accent">
                            {t('transactions.splitBadge')}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <CategoryCell
                          transaction={transaction}
                          categories={categories}
                          onBudget={account?.onBudget ?? true}
                        />
                      </span>
                      <span className="hidden truncate text-caption text-ink-3 md:block">
                        {account?.name ?? '—'}
                      </span>
                      <span className="text-right text-body">
                        <MoneyText
                          value={moneyFromDto(transaction.total)}
                          tone="signed"
                          signDisplay="auto"
                        />
                      </span>
                    </Row>

                    <div className="flex flex-none items-center gap-1 pr-2">
                      {isSplit && (
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setExpanded(open ? null : transaction.id)}
                          className="cursor-pointer rounded-control px-2 py-1 text-caption text-ink-3 hover:text-ink"
                        >
                          {open ? t('transactions.hideParts') : t('transactions.showParts')}
                        </button>
                      )}
                      {deletable && (
                        <button
                          type="button"
                          onClick={() => onDelete(transaction)}
                          aria-label={t('transactions.deleteOne', {
                            payee: describe(transaction),
                          })}
                          className="cursor-pointer rounded-control px-2 py-1 text-caption text-ink-3 hover:text-negative"
                        >
                          {t('common.delete')}
                        </button>
                      )}
                    </div>
                  </div>

                  {open && (
                    <ul className="m-0 flex list-none flex-col gap-1 py-1 pr-7 pl-10">
                      {transaction.lines.map((line) => {
                        const category = line.categoryId
                          ? categories.get(line.categoryId)
                          : undefined
                        return (
                          <li
                            key={line.id}
                            className="flex items-center justify-between gap-3 border-l-2 border-divider pl-3 text-caption text-ink-2"
                          >
                            <span className="truncate">
                              {line.memo ?? category?.label ?? t('transactions.untitled')}
                            </span>
                            <span className="flex items-center gap-3">
                              <span className="text-ink-3">{category?.label}</span>
                              <MoneyText
                                value={moneyFromDto(line.amount)}
                                tone="signed"
                                signDisplay="auto"
                              />
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
