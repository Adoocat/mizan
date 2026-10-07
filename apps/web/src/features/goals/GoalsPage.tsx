import { decimal, type Decimal } from '@mizan/domain'
import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import { PercentText } from '../../components/finance/PercentText'
import { PageContainer, PageHeader } from '../../components/layout/AppShell'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Panel'
import { useSampleData } from '../../lib/sample-data'

const RADIUS = 34
/** π to enough places for a 80px ring; kept as a Decimal so no stroke length is a float. */
const CIRCUMFERENCE = decimal('3.14159265358979').times(2).times(RADIUS)

/** A single goal's progress as a ring (2.0 §00: "rings for single goals"). */
function GoalRing({ share, tone }: { share: Decimal; tone: string }) {
  // The ratio becomes a stroke length here — a display boundary, like a chart coordinate.
  const filled = share.times(CIRCUMFERENCE).toFixed(2)
  return (
    <svg viewBox="0 0 80 80" aria-hidden className="size-20 flex-none -rotate-90">
      <circle cx="40" cy="40" r={RADIUS} fill="none" stroke="var(--m-track)" strokeWidth="6" />
      <circle
        cx="40"
        cy="40"
        r={RADIUS}
        fill="none"
        stroke={tone}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${CIRCUMFERENCE.toFixed(2)}`}
      />
    </svg>
  )
}

const TONE_STROKE: Record<string, string> = {
  onTrack: 'var(--m-positive)',
  behind: 'var(--m-warning)',
  neutral: 'var(--m-accent)',
}

export function GoalsPage() {
  const { t } = useTranslation()
  const data = useSampleData()

  return (
    <PageContainer>
      <PageHeader
        eyebrow={t('goals.eyebrow')}
        title={t('pages.goals.title')}
        actions={<Button variant="primary">{t('goals.newGoal')}</Button>}
      />

      <Panel
        title={t('goals.summary', { count: data.goals.length })}
        meta={
          <>
            <MoneyText value={data.goalsTotal} fractionDigits="none" /> {t('goals.committed')}
          </>
        }
      >
        <div className="grid gap-5 md:grid-cols-2">
          {data.goals.map((goal) => {
            const share = goal.saved.amount.dividedBy(goal.target.amount)
            return (
              <article key={goal.id} className="flex items-center gap-5 rounded-inset bg-inset p-5">
                <div className="relative flex-none">
                  <GoalRing share={share} tone={TONE_STROKE[goal.status] ?? 'var(--m-accent)'} />
                  <span className="absolute inset-0 flex items-center justify-center text-caption font-medium text-ink">
                    <PercentText value={share} fractionDigits={0} />
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <h3 className="m-0 text-panel-title text-ink">{t(`goals.names.${goal.id}`)}</h3>
                  <p className="m-0 text-body text-ink-2">
                    <MoneyText value={goal.saved} fractionDigits="none" />
                    <span className="text-ink-3">
                      {' '}
                      {t('goals.of')} <MoneyText value={goal.target} fractionDigits="none" />
                    </span>
                  </p>
                  <p
                    className={`m-0 text-caption ${
                      goal.status === 'behind'
                        ? 'text-warning'
                        : goal.status === 'onTrack'
                          ? 'text-positive'
                          : 'text-ink-3'
                    }`}
                  >
                    {t(`goals.notes.${goal.id}`)}
                  </p>
                </div>
              </article>
            )
          })}
        </div>
      </Panel>

      <Panel title={t('goals.howItWorks')}>
        <p className="m-0 max-w-[60ch] text-body text-ink-2">{t('goals.howItWorksBody')}</p>
      </Panel>

      <p className="m-0 text-caption text-ink-3">{t('home.sampleNote', { phase: 8 })}</p>
    </PageContainer>
  )
}
