import { moneyFromDto, type LedgerEntryDto } from '@mizan/contracts'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import { PageContainer, PageHeader } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { FormError } from '../../components/ui/Field'
import { Panel, panelLinkClass } from '../../components/ui/Panel'
import { Skeleton } from '../../components/ui/Skeleton'
import { ApiError } from '../../lib/api-client'
import { useFormatDate } from '../../lib/format-date'
import { useAccount, useSetAccountArchived } from './api'
import { useAccountIdParam } from './route-params'
import { AccountFormDialog } from './AccountFormDialog'
import { ReconcileDialog } from './ReconcileDialog'

function EntryRow({ entry }: { entry: LedgerEntryDto }) {
  const { t } = useTranslation()
  const formatDate = useFormatDate()
  return (
    <li className="mx-3 flex items-center gap-4 rounded-control px-4 py-3 hover:bg-inset">
      <span className="w-[7.5rem] flex-none text-caption tabular-nums text-ink-3">
        {formatDate(entry.date)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body text-ink">
          {entry.payee ?? t(`accounts.entryTypes.${entry.type}`)}
        </span>
        {entry.memo && <span className="truncate text-caption text-ink-3">{entry.memo}</span>}
      </span>
      <span className="flex-none text-value-s text-ink">
        <MoneyText value={moneyFromDto(entry.amount)} tone="signed" signDisplay="always" />
      </span>
    </li>
  )
}

/**
 * One account: its derived balance, what it is, and what has moved through it.
 *
 * The activity list is deliberately short: it shows the most recent movements and links to the
 * Transactions page filtered to this account, which is where filters, search and splits live.
 * Everything here is read back from the API after each change, so the balance on screen is always
 * the sum of the lines rather than something the client worked out.
 */
export function AccountDetailPage() {
  const { t } = useTranslation()
  const accountId = useAccountIdParam()
  const { data, isPending, error } = useAccount(accountId ?? '')
  const archive = useSetAccountArchived(accountId ?? '')

  const [editing, setEditing] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [confirmingArchive, setConfirmingArchive] = useState(false)

  if (accountId === null || error) {
    const missing = accountId === null || (error instanceof ApiError && error.status === 404)
    return (
      <PageContainer>
        <PageHeader title={t('pages.accounts.title')} />
        <EmptyState
          title={missing ? t('accounts.detail.notFound') : t('accounts.loadFailed')}
          action={
            <Link to="/accounts" className={panelLinkClass}>
              {t('accounts.detail.backToAccounts')}
            </Link>
          }
        />
      </PageContainer>
    )
  }

  if (isPending || !data) {
    return (
      <PageContainer>
        <div
          role="status"
          aria-busy
          aria-label={t('common.loading')}
          className="flex flex-col gap-4"
        >
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-32 w-full rounded-card" />
          <Skeleton className="h-48 w-full rounded-card" />
        </div>
      </PageContainer>
    )
  }

  const { account, entries } = data
  const archived = account.archivedAt !== null

  return (
    <PageContainer>
      <PageHeader
        eyebrow={
          <Link to="/accounts" className={panelLinkClass}>
            {t('accounts.detail.backToAccounts')}
          </Link>
        }
        title={account.name}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t('accounts.detail.edit')}
            </Button>
            {!archived && (
              <Button variant="secondary" onClick={() => setReconciling(true)}>
                {t('accounts.detail.reconcile')}
              </Button>
            )}
            <Button
              variant={archived ? 'secondary' : 'danger'}
              loading={archive.isPending}
              onClick={() => (archived ? archive.mutate(false) : setConfirmingArchive(true))}
            >
              {archived ? t('accounts.detail.unarchive') : t('accounts.detail.archive')}
            </Button>
          </div>
        }
      />

      {archive.error && (
        <FormError>
          {archive.error instanceof ApiError
            ? (archive.error.detail ?? t('accounts.detail.archiveFailed'))
            : t('accounts.detail.archiveFailed')}
        </FormError>
      )}

      <Panel title={t('accounts.detail.balance')}>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <span className="text-panel-value text-ink">
            <MoneyText value={moneyFromDto(account.balance)} tone="overspent" />
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{t(`accounts.types.${account.type}`)}</Badge>
            {account.onBudget ? (
              <Badge tone="accent">{t('accounts.onBudget')}</Badge>
            ) : (
              <Badge tone="neutral">{t('accounts.offBudget')}</Badge>
            )}
            {!account.includeInNetWorth && (
              <Badge tone="neutral">{t('accounts.excludedFromNetWorth')}</Badge>
            )}
            {archived && <Badge tone="warning">{t('accounts.archived')}</Badge>}
          </div>
        </div>
        <p className="m-0 max-w-[60ch] text-body text-ink-2">{t('accounts.detail.balanceNote')}</p>
      </Panel>

      <Panel
        title={t('accounts.detail.activity')}
        flush={entries.length > 0}
        action={
          <Link
            to="/transactions"
            search={{ view: 'all' as const, accountId: [account.id] }}
            className={panelLinkClass}
          >
            {t('accounts.detail.allActivity')}
          </Link>
        }
      >
        {entries.length === 0 ? (
          <p className="m-0 text-body text-ink-2">{t('accounts.detail.noActivity')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </Panel>

      <AccountFormDialog
        open={editing}
        onOpenChange={setEditing}
        account={account}
        currency={account.currency}
      />
      <ReconcileDialog open={reconciling} onOpenChange={setReconciling} account={account} />
      <ConfirmDialog
        open={confirmingArchive}
        onOpenChange={setConfirmingArchive}
        title={t('accounts.detail.archiveTitle', { name: account.name })}
        description={t('accounts.detail.archiveBody')}
        confirmLabel={t('accounts.detail.archive')}
        destructive
        onConfirm={() => archive.mutate(true)}
      />
    </PageContainer>
  )
}
