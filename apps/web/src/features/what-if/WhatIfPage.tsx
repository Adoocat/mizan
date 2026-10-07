import { decimal, Money } from '@mizan/domain'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import { PageContainer, PageHeader } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Panel'
import { cn } from '../../lib/cn'
import { cushionWith, MONTH_KEYS, WHAT_IF_PRESETS, WHAT_IF_SIM } from '../../lib/wealth-data'
import { moneyFromDecimal } from '../landing/landing-data'
import { SeriesChart } from '../landing/visuals'

const FUNDING = ['savings', 'pool', 'instalments'] as const
type Funding = (typeof FUNDING)[number]

export function WhatIfPage() {
  const { t } = useTranslation()
  const [amount, setAmount] = useState(() => WHAT_IF_SIM.defaultAmount)
  const [funding, setFunding] = useState<Funding>('savings')

  const cushion = cushionWith(amount)
  const lowest = cushion.reduce((min, value) => (value.lessThan(min) ? value : min), cushion[0]!)
  const safe = lowest.greaterThanOrEqualTo(WHAT_IF_SIM.checkingMinimum.amount)
  // How long until the cushion is back to where it would have been without the purchase.
  const recoveryMonths = cushion.findIndex((value, index) =>
    value.greaterThanOrEqualTo(WHAT_IF_SIM.baseCushion[index]!),
  )

  return (
    <PageContainer>
      <PageHeader
        eyebrow={t('whatIf.eyebrow')}
        title={t('nav.whatIf')}
        actions={<Button variant="secondary">{t('whatIf.saveScenario')}</Button>}
      />

      <Panel title={t('whatIf.question')}>
        <div className="flex flex-wrap gap-2">
          {WHAT_IF_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAmount(decimal(t(`whatIf.presetAmounts.${preset}`)))}
              className="h-[34px] cursor-pointer rounded-full border border-border-strong px-4 text-label font-medium text-ink-2 transition-colors duration-150 ease-mizan hover:bg-inset hover:text-ink"
            >
              {t(`whatIf.presets.${preset}`)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-8">
          <div className="flex flex-1 basis-[22rem] flex-col gap-5">
            <label className="flex flex-col gap-3">
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-label text-ink-3">{t('whatIf.amount')}</span>
                <span className="text-panel-value text-ink">
                  <MoneyText value={moneyFromDecimal(amount)} fractionDigits="none" />
                </span>
              </span>
              <input
                type="range"
                min={WHAT_IF_SIM.min.toFixed(0)}
                max={WHAT_IF_SIM.max.toFixed(0)}
                step={2500}
                value={amount.toFixed(0)}
                onChange={(event) => setAmount(decimal(event.target.value))}
                className="w-full accent-accent"
              />
            </label>
            <div className="flex justify-between gap-3 text-caption text-ink-3">
              <span>
                <MoneyText value={moneyFromDecimal(WHAT_IF_SIM.min)} fractionDigits="none" />
              </span>
              <span>
                <MoneyText value={moneyFromDecimal(WHAT_IF_SIM.max)} fractionDigits="none" />
              </span>
            </div>

            <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
              <legend className="mb-1 p-0 text-label text-ink-3">{t('whatIf.howPaid')}</legend>
              {FUNDING.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={funding === option}
                  onClick={() => setFunding(option)}
                  className={cn(
                    'flex cursor-pointer flex-col gap-1 rounded-control border px-4 py-3 text-left transition-colors duration-150 ease-mizan',
                    funding === option
                      ? 'border-accent-strong bg-surface'
                      : 'border-border-strong hover:bg-inset',
                  )}
                >
                  <span className="text-body text-ink">{t(`whatIf.funding.${option}.label`)}</span>
                  <span className="text-caption text-ink-3">
                    {t(`whatIf.funding.${option}.desc`)}
                  </span>
                </button>
              ))}
            </fieldset>
            <p className="m-0 text-caption text-ink-3">{t('whatIf.minimumNote')}</p>
          </div>

          <div className="flex flex-[1.3] basis-[26rem] flex-col gap-6">
            <div className="flex flex-col gap-3">
              <Badge tone={safe ? 'positive' : 'warning'}>
                {safe ? t('whatIf.verdictSafe') : t('whatIf.verdictTight')}
              </Badge>
              <p className="m-0 text-lead text-ink-2">
                {safe
                  ? t('whatIf.verdictSafeBody', { months: Math.max(recoveryMonths, 1) })
                  : t('whatIf.verdictTightBody')}
              </p>
            </div>

            <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-5">
              <div className="flex flex-col gap-1.5">
                <dt className="text-label text-ink-3">{t('whatIf.lowestCushion')}</dt>
                <dd className={cn('m-0 text-value-s', safe ? 'text-ink' : 'text-warning')}>
                  <MoneyText value={moneyFromDecimal(lowest)} fractionDigits="none" />
                </dd>
              </div>
              <div className="flex flex-col gap-1.5">
                <dt className="text-label text-ink-3">{t('whatIf.minimumBalance')}</dt>
                <dd className="m-0 text-value-s text-ink">
                  <MoneyText value={WHAT_IF_SIM.checkingMinimum} fractionDigits="none" />
                </dd>
              </div>
              <div className="flex flex-col gap-1.5">
                <dt className="text-label text-ink-3">{t('whatIf.recovery')}</dt>
                <dd className="m-0 text-value-s text-ink">
                  {t('debts.months', { count: Math.max(recoveryMonths, 1) })}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </Panel>

      <Panel title={t('whatIf.futureCashFlow')} meta={t('whatIf.futureCashFlowNote')}>
        <SeriesChart
          values={cushion}
          context={WHAT_IF_SIM.baseCushion}
          label={t('whatIf.futureCashFlow')}
          height={200}
        />
        <div className="grid grid-cols-12 gap-1 text-center text-caption text-ink-3">
          {MONTH_KEYS.map((key) => (
            <span key={key}>{t(`months.${key}`)}</span>
          ))}
        </div>
        <div className="flex gap-5 text-caption text-ink-3">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 bg-accent" />
            {t('whatIf.withThis')}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 border-t-2 border-dashed border-ink-3" />
            {t('whatIf.withoutThis')}
          </span>
        </div>
      </Panel>

      <Panel title={t('whatIf.calculation')}>
        <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5">
          {(
            [
              ['amount', <MoneyText value={moneyFromDecimal(amount)} fractionDigits="none" />],
              ['source', t(`whatIf.funding.${funding}.label`)],
              [
                'monthlySurplus',
                <MoneyText value={Money.of('6600', 'TRY')} fractionDigits="none" />,
              ],
              [
                'cushionToday',
                <MoneyText
                  value={moneyFromDecimal(WHAT_IF_SIM.baseCushion[0]!)}
                  fractionDigits="none"
                />,
              ],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className="flex flex-col gap-1.5">
              <dt className="text-label text-ink-3">{t(`whatIf.calc.${key}`)}</dt>
              <dd className="m-0 text-body text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <p className="m-0 text-caption text-ink-3">{t('home.sampleNote', { phase: 19 })}</p>
    </PageContainer>
  )
}
