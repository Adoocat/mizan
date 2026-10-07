import { decimal } from '@mizan/domain'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import { PercentText } from '../../components/finance/PercentText'
import { ProgressBar } from '../../components/finance/Progress'
import { PageContainer, PageHeader } from '../../components/layout/AppShell'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Panel'
import { StatTiles } from '../../components/ui/StatTiles'
import { moneyFromDecimal } from '../landing/landing-data'
import { DEBTS, debtPayoff } from '../../lib/wealth-data'

export function DebtsPage() {
  const { t } = useTranslation()
  const [extra, setExtra] = useState(() => decimal(0))
  const payoff = debtPayoff(extra)

  return (
    <PageContainer>
      <PageHeader
        eyebrow={t('debts.eyebrow')}
        title={t('nav.debts')}
        actions={<Button variant="primary">{t('debts.addDebt')}</Button>}
      />

      <StatTiles
        tiles={[
          {
            key: 'total',
            label: t('debts.tiles.total'),
            value: <MoneyText value={DEBTS.total} fractionDigits="none" />,
            note: t('debts.tiles.totalNote'),
          },
          {
            key: 'monthly',
            label: t('debts.tiles.monthly'),
            value: <MoneyText value={DEBTS.monthlyPayments} fractionDigits="none" />,
            note: t('debts.tiles.monthlyNote', {
              percent: DEBTS.shareOfIncome.times(100).toFixed(0),
            }),
          },
          {
            key: 'interest',
            label: t('debts.tiles.interest'),
            value: <MoneyText value={DEBTS.interest2026} fractionDigits="none" />,
            note: t('debts.tiles.interestNote'),
          },
          {
            key: 'free',
            label: t('debts.tiles.free'),
            value: t('debts.dates.sep2028'),
            note: t('debts.tiles.freeNote'),
          },
        ]}
      />

      <Panel title={t('debts.lines')} flush>
        <div className="flex flex-col">
          <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] gap-x-4 border-b border-divider px-7 pb-2 text-caption font-medium text-ink-3">
            <span>{t('debts.columns.debt')}</span>
            <span className="text-right">{t('debts.columns.remaining')}</span>
            <span className="text-right">{t('debts.columns.rate')}</span>
            <span className="text-right">{t('debts.columns.monthly')}</span>
            <span className="text-right">{t('debts.columns.payoff')}</span>
          </div>
          {DEBTS.lines.map((line) => {
            const repaid = line.original
              .minus(line.remaining)
              .amount.dividedBy(line.original.amount)
            return (
              <div
                key={line.id}
                className="mx-3 flex flex-col gap-2 rounded-control px-4 py-3 hover:bg-inset"
              >
                <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] items-center gap-x-4 text-body">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-ink">{t(`debts.names.${line.id}`)}</span>
                    <span className="truncate text-caption text-ink-3">
                      {t(`debts.lenders.${line.id}`)} · {t('debts.next')} {line.nextDate}
                    </span>
                  </span>
                  <span className="text-right text-ink">
                    <MoneyText value={line.remaining} fractionDigits="none" />
                  </span>
                  <span className="text-right text-ink-2">
                    {line.rate.isZero() ? (
                      t('debts.interestFree')
                    ) : (
                      <PercentText value={line.rate} fractionDigits={1} />
                    )}
                  </span>
                  <span className="text-right text-ink-2">
                    <MoneyText value={line.monthly} fractionDigits="none" />
                  </span>
                  <span className="text-right text-ink-2">{t(`debts.dates.${line.payoff}`)}</span>
                </div>
                <ProgressBar
                  className="max-w-[320px]"
                  value={repaid}
                  tone="positive"
                  label={t(`debts.names.${line.id}`)}
                />
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel title={t('debts.simulator')} meta={t('debts.simulatorNote')}>
        <div className="flex flex-wrap gap-8">
          <div className="flex flex-1 basis-[20rem] flex-col gap-4">
            <label className="flex flex-col gap-3">
              <span className="text-label text-ink-3">
                {t('debts.extra')}{' '}
                <span className="font-medium text-ink">
                  <MoneyText value={moneyFromDecimal(extra)} fractionDigits="none" />
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={DEBTS.maxExtra.toFixed(0)}
                step={250}
                value={extra.toFixed(0)}
                onChange={(event) => setExtra(decimal(event.target.value))}
                className="w-full accent-accent"
              />
            </label>
            <div className="flex justify-between gap-3 text-caption text-ink-3">
              <span>₺0</span>
              <span>
                <MoneyText value={moneyFromDecimal(DEBTS.maxExtra)} fractionDigits="none" />
              </span>
            </div>
            <p className="m-0 text-body text-ink-2">{t('debts.avalanche')}</p>
          </div>

          <dl className="m-0 grid flex-[1.2] basis-[22rem] grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-6">
            <div className="flex flex-col gap-1.5">
              <dt className="text-label text-ink-3">{t('debts.monthsLeft')}</dt>
              <dd className="m-0 text-panel-value text-ink">{payoff.months}</dd>
              <dd className="m-0 text-caption text-ink-3">
                {t('debts.wasMonths', { months: payoff.baseMonths })}
              </dd>
            </div>
            <div className="flex flex-col gap-1.5">
              <dt className="text-label text-ink-3">{t('debts.timeSaved')}</dt>
              <dd className="m-0 text-panel-value text-positive">
                {t('debts.months', { count: payoff.monthsSaved })}
              </dd>
            </div>
            <div className="flex flex-col gap-1.5">
              <dt className="text-label text-ink-3">{t('debts.interestSaved')}</dt>
              <dd className="m-0 text-panel-value text-positive">
                <MoneyText value={moneyFromDecimal(payoff.interestSaved)} fractionDigits="none" />
              </dd>
              <dd className="m-0 text-caption text-ink-3">
                {t('debts.ofRemaining', {
                  amount: moneyFromDecimal(payoff.baseInterest).amount.toDecimalPlaces(0).toFixed(),
                })}
              </dd>
            </div>
          </dl>
        </div>
        <Button variant="secondary" className="self-start">
          {t('debts.addToPlan')}
        </Button>
      </Panel>

      <p className="m-0 text-caption text-ink-3">{t('home.sampleNote', { phase: 16 })}</p>
    </PageContainer>
  )
}
