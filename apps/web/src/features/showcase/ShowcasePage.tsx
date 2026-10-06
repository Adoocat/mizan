import { decimal, Money } from '@mizan/domain'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CurrencyInput } from '../../components/finance/CurrencyInput'
import { MetricCard, MetricRow } from '../../components/finance/MetricCard'
import { MoneyText } from '../../components/finance/MoneyText'
import { DeltaText, PercentText } from '../../components/finance/PercentText'
import { BudgetProgress, ProgressBar } from '../../components/finance/Progress'
import { PageContainer, PageHeader } from '../../components/layout/AppShell'
import { PrivacyToggle, ThemeSwitch } from '../../components/layout/Preferences'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { Skeleton } from '../../components/ui/Skeleton'
import { toast, toastWithUndo } from '../../components/ui/Toaster'

const tl = (amount: string) => Money.of(amount, 'TRY')

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="m-0 text-label font-semibold text-ink-3">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Swatch({ name, className }: { name: string; className: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className={`size-7 flex-none rounded-control border border-border ${className}`}
      />
      <span className="text-label text-ink-2">{name}</span>
    </div>
  )
}

const NEUTRALS = [
  ['Canvas', 'bg-canvas'],
  ['Page', 'bg-page'],
  ['Surface', 'bg-surface'],
  ['Track', 'bg-track'],
  ['Border', 'bg-border'],
  ['Solid', 'bg-primary'],
  ['Ink', 'bg-ink'],
  ['Ink 2', 'bg-ink-2'],
  ['Ink 3', 'bg-ink-3'],
] as const

const SEMANTIC = [
  ['Accent', 'bg-accent'],
  ['Accent soft', 'bg-accent-soft'],
  ['Positive', 'bg-positive'],
  ['Positive soft', 'bg-positive-soft'],
  ['Warning', 'bg-warning'],
  ['Warning soft', 'bg-warning-soft'],
  ['Negative', 'bg-negative'],
  ['Negative soft', 'bg-negative-soft'],
] as const

const DATA = [
  ['Essentials', 'bg-data-essentials'],
  ['Flexible', 'bg-data-flexible'],
  ['Debt', 'bg-data-debt'],
  ['Savings', 'bg-data-savings'],
  ['Investments', 'bg-data-investments'],
  ['Available to spend', 'bg-data-pool'],
] as const

const TYPE_SCALE = [
  ['Hero figure · 52/500', 'text-hero', '₺300'],
  ['Value L · 34/500', 'text-value-l', '₺1,060,200'],
  ['Value M · 24/500', 'text-value-m', '₺7,430'],
  ['Page title · 22/600', 'text-page-title', 'Give every lira a job'],
  ['Value S · 18/500', 'text-value-s', '+₺146,330'],
  ['Card title · 13.5/600', 'text-card-title', 'Upcoming payments in the next 7 days'],
  ['Body · 13/400', 'text-body', 'Unspent allowance carries into tomorrow.'],
  ['Label · 12/400', 'text-label text-ink-3', 'Monthly contribution'],
  ['Caption · 11.5/400', 'text-caption', 'Updated 14:58'],
  ['Mono · 11/400', 'text-mono font-mono', '⌘K  INV-0412'],
] as const

/** Every design-system component in one place, in the current theme and language. */
export function ShowcasePage() {
  const { t } = useTranslation()
  const [amount, setAmount] = useState<Money | null>(tl('1250.5'))
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <PageContainer>
      <PageHeader title={t('showcase.title')} actions={<ThemeSwitch />} />
      <p className="m-0 max-w-2xl text-body text-ink-2">{t('showcase.intro')}</p>

      <Section id="sc-colours" title={t('showcase.colours')}>
        <Card className="grid gap-5 md:grid-cols-3">
          <div className="flex flex-col gap-2">
            {NEUTRALS.map(([name, className]) => (
              <Swatch key={name} name={name} className={className} />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {SEMANTIC.map(([name, className]) => (
              <Swatch key={name} name={name} className={className} />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {DATA.map(([name, className]) => (
              <Swatch key={name} name={name} className={className} />
            ))}
          </div>
        </Card>
      </Section>

      <Section id="sc-type" title={t('showcase.typography')}>
        <Card className="flex flex-col divide-y divide-divider p-0">
          {TYPE_SCALE.map(([name, className, sample]) => (
            <div
              key={name}
              className="grid gap-1 px-5 py-3 md:grid-cols-[200px_1fr] md:items-baseline"
            >
              <span className="text-caption text-ink-3">{name}</span>
              <span className={`truncate text-ink ${className}`}>{sample}</span>
            </div>
          ))}
        </Card>
      </Section>

      <Section id="sc-buttons" title={t('showcase.buttons')}>
        <Card className="flex flex-wrap items-center gap-3">
          <Button variant="primary">{t('showcase.savePlan')}</Button>
          <Button variant="secondary">{t('showcase.export')}</Button>
          <Button variant="ghost">{t('common.cancel')}</Button>
          <Button variant="danger">{t('common.delete')}</Button>
          <Button variant="primary" disabled>
            {t('showcase.savePlan')}
          </Button>
          <Button variant="primary" loading>
            {t('showcase.savePlan')}
          </Button>
          <Button size="sm">{t('showcase.small')}</Button>
        </Card>
      </Section>

      <Section id="sc-badges" title={t('showcase.badges')}>
        <Card className="flex flex-wrap gap-2">
          <Badge>{t('showcase.badge.paid')}</Badge>
          <Badge tone="accent">{t('showcase.badge.upcoming')}</Badge>
          <Badge tone="estimated">{t('showcase.badge.estimated')}</Badge>
          <Badge tone="negative">{t('showcase.badge.overdue')}</Badge>
          <Badge tone="warning">{t('showcase.badge.pending')}</Badge>
          <Badge tone="positive">{t('showcase.badge.onTrack')}</Badge>
        </Card>
      </Section>

      <Section id="sc-money" title={t('showcase.money')}>
        <Card className="flex flex-col gap-4">
          <div data-testid="money-samples">
            <MetricRow
              items={[
                { label: t('showcase.moneyDefault'), value: <MoneyText value={tl('50000.5')} /> },
                {
                  label: t('showcase.moneyWhole'),
                  value: <MoneyText value={tl('1060200')} fractionDigits="none" />,
                },
                {
                  label: t('showcase.moneyIncome'),
                  value: <MoneyText value={tl('53500')} tone="signed" signDisplay="always" />,
                },
                {
                  label: t('showcase.moneyOverspent'),
                  value: <MoneyText value={tl('-110')} tone="overspent" />,
                },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-body">
            <span>
              {t('showcase.percent')}: <PercentText value={decimal('0.715')} />
            </span>
            <span>
              {t('showcase.deltaGood')}: <DeltaText value={decimal('0.035')} />
            </span>
            <span>
              {t('showcase.deltaSpending')}: <DeltaText value={decimal('0.12')} invert />
            </span>
            <PrivacyToggle />
          </div>
        </Card>
      </Section>

      <Section id="sc-input" title={t('showcase.currencyInput')}>
        <Card className="grid gap-4 md:grid-cols-2">
          <CurrencyInput
            label={t('showcase.amount')}
            value={amount}
            onChange={setAmount}
            hint={t('showcase.amountHint')}
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-label text-ink-3">{t('showcase.wireValue')}</span>
            <code
              className="rounded-control bg-canvas px-3 py-2 font-mono text-mono text-ink-2"
              data-testid="wire-value"
            >
              {amount ? JSON.stringify(amount.toDto()) : 'null'}
            </code>
          </div>
        </Card>
      </Section>

      <Section id="sc-metrics" title={t('showcase.metrics')}>
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard
            size="hero"
            label={t('showcase.safeToday')}
            value={<MoneyText value={tl('300')} fractionDigits="none" />}
            footnote={t('showcase.safeTodayFootnote')}
          />
          <MetricCard
            label={t('showcase.availableToSpend')}
            value={<MoneyText value={tl('3000')} fractionDigits="none" />}
            footnote={t('showcase.availableFootnote')}
          >
            <ProgressBar
              value={decimal('0.3333')}
              tone="accent"
              label={t('showcase.availableToSpend')}
            />
          </MetricCard>
          <MetricCard
            size="small"
            label={t('showcase.leftToAllocate')}
            value={<MoneyText value={tl('0')} fractionDigits="none" />}
          >
            <Badge tone="positive">{t('showcase.badge.fullyAllocated')}</Badge>
          </MetricCard>
        </div>
      </Section>

      <Section id="sc-progress" title={t('showcase.progress')}>
        <Card className="flex flex-col gap-5">
          <BudgetProgress
            name={t('showcase.utilities')}
            spent={tl('1050')}
            limit={tl('1380')}
            status="onPace"
            expectedPace={decimal('0.77')}
            note={
              <>
                <MoneyText value={tl('330')} fractionDigits="none" /> {t('budget.left')}
              </>
            }
          />
          <BudgetProgress
            name={t('showcase.groceries')}
            spent={tl('4850')}
            limit={tl('6000')}
            status="aheadOfPace"
            expectedPace={decimal('0.71')}
            note={
              <>
                <MoneyText value={tl('1150')} fractionDigits="none" /> {t('budget.left')} ·{' '}
                {t('budget.status.aheadOfPace')}
              </>
            }
          />
          <BudgetProgress
            name={t('showcase.personalCare')}
            spent={tl('610')}
            limit={tl('500')}
            status="over"
            expectedPace={decimal('0.71')}
            note={
              <>
                <MoneyText value={tl('110')} fractionDigits="none" /> {t('budget.over')}
              </>
            }
          />
          <div className="flex h-2.5 overflow-hidden rounded-bar" aria-hidden>
            <span className="w-[54%] bg-data-essentials" />
            <span className="w-[12%] bg-data-flexible" />
            <span className="w-[6%] bg-data-debt" />
            <span className="w-[10%] bg-data-savings" />
            <span className="w-[8%] bg-data-investments" />
            <span className="w-[10%] bg-data-pool" />
          </div>
        </Card>
      </Section>

      <Section id="sc-feedback" title={t('showcase.feedback')}>
        <Card className="flex flex-wrap gap-3">
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            {t('showcase.deleteTransaction')}
          </Button>
          <Button
            onClick={() =>
              toastWithUndo(t('showcase.deletedToast'), t('common.undo'), () =>
                toast(t('showcase.restoredToast')),
              )
            }
          >
            {t('showcase.showToast')}
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title={t('showcase.confirmTitle')}
            description={t('showcase.confirmDescription')}
            confirmLabel={t('common.delete')}
            destructive
            onConfirm={() =>
              toastWithUndo(t('showcase.deletedToast'), t('common.undo'), () =>
                toast(t('showcase.restoredToast')),
              )
            }
          />
        </Card>
      </Section>

      <Section id="sc-empty" title={t('showcase.emptyAndLoading')}>
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState
            title={t('showcase.emptyTitle')}
            description={t('showcase.emptyDescription')}
            action={<Button variant="primary">{t('showcase.addAccount')}</Button>}
          />
          <Card
            className="flex flex-col gap-3"
            role="status"
            aria-busy="true"
            aria-label={t('common.loading')}
          >
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-2 w-5/6" />
          </Card>
        </div>
      </Section>
    </PageContainer>
  )
}
