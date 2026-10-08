import {
  moneyFromDto,
  TRANSACTION_VIEWS,
  type AccountDto,
  type TransactionDto,
  type TransactionView,
} from '@mizan/contracts'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import { PageContainer, PageHeader } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { FormError } from '../../components/ui/Field'
import { Panel } from '../../components/ui/Panel'
import { Skeleton } from '../../components/ui/Skeleton'
import { toast, toastWithUndo } from '../../components/ui/Toaster'
import { cn } from '../../lib/cn'
import { useAccounts } from '../accounts/api'
import { useCurrentSession } from '../auth/session'
import { useCategories } from '../categories/api'
import { optionsById, useCategoryOptions } from '../categories/names'
import { useDeleteTransaction, useRestoreTransaction, useTransactions } from './api'
import { useQuickAdd } from './quick-add'
import { transactionsSearchSchema, type TransactionsSearch } from './search'
import { TransactionFormDialog } from './TransactionFormDialog'
import { TransactionList } from './TransactionList'

/** Reads the filters from the URL, which is where they live (§13). */
function useFilters(): TransactionsSearch {
  // The router types `location.search` as `any`; the schema is what gives it a shape.
  const raw: unknown = useRouterState({ select: (state): unknown => state.location.search })
  return transactionsSearchSchema.parse(raw ?? {})
}

/** A multi-select filter chip with a dropdown, as the mockup's Account and Category menus. */
function FilterMenu({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: { id: string; label: string; hint?: string }[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const count = selected.length

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex h-[34px] cursor-pointer items-center gap-2 rounded-full border px-4 text-label font-medium transition-colors duration-150 ease-mizan',
          count > 0
            ? 'border-accent bg-surface text-ink'
            : 'border-border-strong bg-surface text-ink-2 hover:bg-inset',
        )}
      >
        {label}
        {count > 0 && <span className="text-accent">{count}</span>}
      </button>

      {open && (
        <>
          {/* Clicking anywhere else closes the menu. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <ul
            aria-label={label}
            className="absolute top-10 left-0 z-50 m-0 max-h-72 w-64 list-none overflow-y-auto rounded-inset border border-border bg-surface p-1.5 shadow-overlay"
          >
            {options.map((option) => {
              const checked = selected.includes(option.id)
              return (
                <li key={option.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-control px-3 py-2 text-body text-ink hover:bg-inset">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        onChange(
                          checked
                            ? selected.filter((id) => id !== option.id)
                            : [...selected, option.id],
                        )
                      }
                      className="size-3.5 flex-none accent-[var(--m-primary)]"
                    />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.hint && (
                      <span className="flex-none text-caption text-ink-3">{option.hint}</span>
                    )}
                  </label>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

export function TransactionsPage() {
  const { t } = useTranslation()
  const { workspace } = useCurrentSession()
  const navigate = useNavigate()
  const filters = useFilters()

  const quickAdd = useQuickAdd()
  const [editing, setEditing] = useState<TransactionDto | null>(null)

  const { data, isPending, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useTransactions({
      view: filters.view,
      q: filters.q,
      from: filters.from,
      to: filters.to,
      accountId: filters.accountId,
      categoryId: filters.categoryId,
    })
  const { data: accountData } = useAccounts()
  const { data: categoryData } = useCategories()

  const remove = useDeleteTransaction()
  const restore = useRestoreTransaction()

  const categoryOptions = useCategoryOptions(categoryData)
  const categoriesById = optionsById(categoryOptions)
  const accounts = accountData?.accounts ?? []
  const accountsById = new Map(accounts.map((account: AccountDto) => [account.id, account]))

  const base = workspace.baseCurrency
  const transactions = data?.transactions ?? []
  const summary = data?.summary

  /** Every filter change replaces the URL's search, which is what re-runs the query. */
  const setSearch = (patch: Partial<TransactionsSearch>) => {
    void navigate({ to: '/transactions', search: { ...filters, ...patch } })
  }

  const hasFilters =
    filters.view !== 'all' ||
    Boolean(filters.q) ||
    Boolean(filters.from ?? filters.to) ||
    (filters.accountId?.length ?? 0) > 0 ||
    (filters.categoryId?.length ?? 0) > 0

  function onDelete(transaction: TransactionDto) {
    remove.mutate(transaction.id, {
      onSuccess: () =>
        // Soft delete, so Undo is simply a restore (§7).
        toastWithUndo(t('transactions.deleted'), t('common.undo'), () =>
          restore.mutate(transaction.id, {
            onError: () => toast(t('transactions.undoFailed')),
          }),
        ),
      onError: () => toast(t('transactions.deleteFailed')),
    })
  }

  const tiles = summary
    ? [
        { key: 'income', value: moneyFromDto(summary.income), signed: true },
        { key: 'spending', value: moneyFromDto(summary.spending), signed: true },
        { key: 'transfers', value: moneyFromDto(summary.transfers), signed: false },
      ]
    : []

  return (
    <PageContainer>
      <PageHeader
        eyebrow={summary ? t('transactions.matched', { count: summary.matched }) : undefined}
        title={t('pages.transactions.title')}
      />

      {error && <FormError>{t('transactions.loadFailed')}</FormError>}

      <div className="grid gap-5 md:grid-cols-4">
        {tiles.map((tile) => (
          <section
            key={tile.key}
            aria-label={t(`transactions.summary.${tile.key}`)}
            className="flex flex-col gap-2 rounded-card border border-transparent bg-surface p-7"
          >
            <h2 className="m-0 text-label font-normal text-ink-3">
              {t(`transactions.summary.${tile.key}`)}
            </h2>
            <span className="text-value-m">
              <MoneyText
                value={tile.value}
                tone="signed"
                signDisplay={tile.signed ? 'always' : 'auto'}
              />
            </span>
          </section>
        ))}
        {summary && (
          <section
            aria-label={t('transactions.summary.needsReview')}
            className="flex flex-col gap-2 rounded-card border border-transparent bg-surface p-7"
          >
            <h2 className="m-0 text-label font-normal text-ink-3">
              {t('transactions.summary.needsReview')}
            </h2>
            <span className="text-value-m text-ink">{summary.needsReview}</span>
            {summary.needsReview > 0 && (
              <button
                type="button"
                onClick={() => setSearch({ view: 'needsReview' })}
                className="cursor-pointer self-start border-0 bg-transparent p-0"
              >
                <Badge tone="warning">{t('transactions.reviewThem')}</Badge>
              </button>
            )}
          </section>
        )}
      </div>

      <Panel
        title={t('transactions.list')}
        flush
        action={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-[34px] items-center gap-2 rounded-full border border-border-strong bg-surface px-4">
              <span className="sr-only">{t('transactions.searchLabel')}</span>
              <input
                type="search"
                value={filters.q ?? ''}
                placeholder={t('transactions.searchPlaceholder')}
                onChange={(event) => setSearch({ q: event.target.value || undefined })}
                className="w-40 min-w-0 bg-transparent text-label text-ink outline-none placeholder:text-ink-3"
              />
            </label>

            <div
              role="group"
              aria-label={t('transactions.filter')}
              className="flex flex-wrap gap-2"
            >
              {TRANSACTION_VIEWS.map((option: TransactionView) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={filters.view === option}
                  onClick={() => setSearch({ view: option })}
                  className={cn(
                    'h-[34px] cursor-pointer rounded-full border px-4 text-label font-medium transition-colors duration-150 ease-mizan',
                    filters.view === option
                      ? 'border-transparent bg-primary text-on-primary'
                      : 'border-border-strong bg-surface text-ink-2 hover:bg-inset',
                  )}
                >
                  {t(`transactions.filters.${option}`)}
                </button>
              ))}
            </div>

            <FilterMenu
              label={t('transactions.columns.account')}
              options={accounts.map((account) => ({ id: account.id, label: account.name }))}
              selected={filters.accountId ?? []}
              onChange={(ids) => setSearch({ accountId: ids.length > 0 ? ids : undefined })}
            />
            <FilterMenu
              label={t('transactions.columns.category')}
              options={categoryOptions.map((option) => ({
                id: option.id,
                label: option.label,
                hint: option.groupLabel,
              }))}
              selected={filters.categoryId ?? []}
              onChange={(ids) => setSearch({ categoryId: ids.length > 0 ? ids : undefined })}
            />

            {hasFilters && (
              <button
                type="button"
                onClick={() =>
                  void navigate({ to: '/transactions', search: { view: 'all' as const } })
                }
                className="cursor-pointer border-0 bg-transparent px-2 text-label font-medium text-accent hover:underline"
              >
                {t('transactions.clearFilters')}
              </button>
            )}
          </div>
        }
      >
        {isPending ? (
          <div role="status" aria-busy aria-label={t('common.loading')} className="px-7">
            <Skeleton className="h-64 w-full rounded-card" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="px-7 pb-2">
            <EmptyState
              title={
                hasFilters ? t('transactions.noMatchesTitle') : t('pages.transactions.emptyTitle')
              }
              description={hasFilters ? t('transactions.noMatches') : t('transactions.emptyBody')}
              action={
                hasFilters ? (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void navigate({ to: '/transactions', search: { view: 'all' as const } })
                    }
                  >
                    {t('transactions.clearFilters')}
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => quickAdd?.open()}>
                    {t('transactions.addFirst')}
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <TransactionList
            transactions={transactions}
            accounts={accountsById}
            categories={categoriesById}
            onEdit={setEditing}
            onDelete={onDelete}
            baseCurrency={base}
          />
        )}

        {hasNextPage && (
          <div className="flex justify-center px-7 pb-2">
            <Button
              variant="secondary"
              loading={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {t('transactions.loadEarlier')}
            </Button>
          </div>
        )}
      </Panel>

      {editing && (
        <TransactionFormDialog
          key={editing.id}
          open
          onOpenChange={(next) => !next && setEditing(null)}
          transaction={editing}
        />
      )}
    </PageContainer>
  )
}
