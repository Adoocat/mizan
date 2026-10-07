import { Money } from '@mizan/domain'
import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import { PageContainer, PageHeader } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Panel'
import { useSampleData, type AccountLine } from '../../lib/sample-data'

const GROUP_ORDER: AccountLine['kind'][] = ['checking', 'cash', 'savings', 'card']

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase()
}

export function AccountsPage() {
  const { t } = useTranslation()
  const data = useSampleData()

  const total = data.accounts.reduce((sum, account) => sum.plus(account.balance), Money.zero('TRY'))

  return (
    <PageContainer>
      <PageHeader
        eyebrow={t('accounts.eyebrow', { count: data.accounts.length })}
        title={t('pages.accounts.title')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary">{t('accounts.addManual')}</Button>
            <Button variant="primary">{t('accounts.connect')}</Button>
          </div>
        }
      />

      <Panel title={t('accounts.readOnly')}>
        <p className="m-0 max-w-[60ch] text-body text-ink-2">{t('accounts.readOnlyBody')}</p>
        <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5">
          {['twoStep', 'devices', 'encryption'].map((key) => (
            <div key={key} className="flex flex-col gap-1">
              <dt className="text-label text-ink-3">{t(`accounts.security.${key}.label`)}</dt>
              <dd className="m-0 text-body text-ink">{t(`accounts.security.${key}.value`)}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      {GROUP_ORDER.map((kind) => {
        const accounts = data.accounts.filter((account) => account.kind === kind)
        if (accounts.length === 0) return null
        const groupTotal = accounts.reduce(
          (sum, account) => sum.plus(account.balance),
          Money.zero('TRY'),
        )
        return (
          <Panel
            key={kind}
            title={t(`accounts.kinds.${kind}`)}
            flush
            action={
              <span className="text-value-s text-ink">
                <MoneyText value={groupTotal} fractionDigits="none" />
              </span>
            }
          >
            <ul className="m-0 flex list-none flex-col p-0">
              {accounts.map((account) => (
                <li
                  key={account.id}
                  className="mx-3 flex items-center gap-4 rounded-control px-4 py-3.5 hover:bg-inset"
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
                      {account.institution}
                      {account.meta && ` · ${t('accounts.statement', { date: account.meta })}`}
                    </span>
                  </span>
                  {account.id === 'house' ? (
                    <Badge tone="warning">{t('accounts.accessExpired')}</Badge>
                  ) : (
                    <Badge tone="positive">{t('accounts.synced', { time: data.lastSync })}</Badge>
                  )}
                  <span className="flex-none text-value-s text-ink">
                    <MoneyText value={account.balance} tone="overspent" fractionDigits="none" />
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )
      })}

      <Panel title={t('accounts.total')}>
        <div className="flex items-baseline justify-between gap-4">
          <p className="m-0 max-w-[48ch] text-body text-ink-2">{t('accounts.totalNote')}</p>
          <span className="text-panel-value text-ink">
            <MoneyText value={total} fractionDigits="none" />
          </span>
        </div>
      </Panel>

      <p className="m-0 text-caption text-ink-3">{t('home.sampleNote', { phase: 4 })}</p>
    </PageContainer>
  )
}
