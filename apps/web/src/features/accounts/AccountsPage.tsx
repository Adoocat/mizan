import { moneyFromDto, type AccountDto } from '@mizan/contracts'
import { accountGroupOf, ACCOUNT_GROUPS, Money, type AccountGroup } from '@mizan/domain'
import { Link } from '@tanstack/react-router'
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
import { useCurrentSession } from '../auth/session'
import { AccountFormDialog } from './AccountFormDialog'
import { useAccounts } from './api'

/** Initials of the account name, as the mockup's avatar circle. */
function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0] ?? '')
      .join('')
      .toUpperCase() || '?'
  )
}

function AccountRow({ account }: { account: AccountDto }) {
  const { t } = useTranslation()
  return (
    <li>
      <Link
        to="/accounts/$accountId"
        params={{ accountId: account.id }}
        className="mx-3 flex items-center gap-4 rounded-control px-4 py-3.5 no-underline hover:bg-inset hover:no-underline"
      >
        <span
          aria-hidden
          className="flex size-9 flex-none items-center justify-center rounded-full bg-inset text-caption font-medium text-ink-2"
        >
          {initials(account.name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-body text-ink">{account.name}</span>
          <span className="truncate text-caption text-ink-3">
            {account.institution ?? t(`accounts.types.${account.type}`)}
          </span>
        </span>
        {account.archivedAt && <Badge tone="neutral">{t('accounts.archived')}</Badge>}
        {!account.onBudget && <Badge tone="neutral">{t('accounts.offBudget')}</Badge>}
        <span className="flex-none text-value-s text-ink">
          <MoneyText value={moneyFromDto(account.balance)} tone="overspent" />
        </span>
      </Link>
    </li>
  )
}

export function AccountsPage() {
  const { t } = useTranslation()
  const { workspace } = useCurrentSession()
  const [showArchived, setShowArchived] = useState(false)
  const [adding, setAdding] = useState(false)
  const { data, isPending, error } = useAccounts(showArchived)

  const accounts = data?.accounts ?? []
  const netWorth = data ? moneyFromDto(data.netWorth) : Money.zero(workspace.baseCurrency)

  return (
    <PageContainer>
      <PageHeader
        eyebrow={isPending ? undefined : t('accounts.eyebrow', { count: accounts.length })}
        title={t('pages.accounts.title')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              aria-pressed={showArchived}
              onClick={() => setShowArchived((value) => !value)}
            >
              {showArchived ? t('accounts.hideArchived') : t('accounts.showArchived')}
            </Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              {t('accounts.add')}
            </Button>
          </div>
        }
      />

      {error && <FormError>{t('accounts.loadFailed')}</FormError>}

      {isPending ? (
        <div
          role="status"
          aria-busy
          aria-label={t('common.loading')}
          className="flex flex-col gap-4"
        >
          <Skeleton className="h-28 w-full rounded-card" />
          <Skeleton className="h-48 w-full rounded-card" />
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState
          title={t('pages.accounts.emptyTitle')}
          description={t('accounts.emptyBody')}
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              {t('accounts.add')}
            </Button>
          }
        />
      ) : (
        <>
          {ACCOUNT_GROUPS.map((group: AccountGroup) => {
            const inGroup = accounts.filter((account) => accountGroupOf(account.type) === group)
            if (inGroup.length === 0) return null
            const groupTotal = Money.sum(
              inGroup.map((account) => moneyFromDto(account.balance)),
              workspace.baseCurrency,
            )
            return (
              <Panel
                key={group}
                title={t(`accounts.groups.${group}`)}
                flush
                action={
                  <span className="text-value-s text-ink">
                    <MoneyText value={groupTotal} tone="overspent" />
                  </span>
                }
              >
                <ul className="m-0 flex list-none flex-col p-0">
                  {inGroup.map((account) => (
                    <AccountRow key={account.id} account={account} />
                  ))}
                </ul>
              </Panel>
            )
          })}

          <Panel title={t('accounts.netWorth')}>
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <p className="m-0 max-w-[48ch] text-body text-ink-2">{t('accounts.netWorthNote')}</p>
              <span className="text-panel-value text-ink">
                <MoneyText value={netWorth} tone="overspent" />
              </span>
            </div>
          </Panel>
        </>
      )}

      <AccountFormDialog open={adding} onOpenChange={setAdding} currency={workspace.baseCurrency} />
    </PageContainer>
  )
}
