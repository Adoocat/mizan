import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import { PageContainer, PageHeader } from '../../components/layout/AppShell'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Panel'
import { StatTiles } from '../../components/ui/StatTiles'
import { cn } from '../../lib/cn'
import { useSampleData } from '../../lib/sample-data'
import { UpcomingList } from './UpcomingList'

/** October 2026 starts on a Thursday; the grid runs Monday-first, as the mockup does. */
const BLANKS = 3
const DAYS_IN_MONTH = 31
const TODAY = 22

export function CalendarPage() {
  const { t } = useTranslation()
  const data = useSampleData()

  const byDay = new Map(data.upcoming.map((item) => [item.day, item]))

  return (
    <PageContainer>
      <PageHeader
        eyebrow={t('upcoming.eyebrow')}
        title={t('nav.calendar')}
        actions={<Button variant="primary">{t('upcoming.addRecurring')}</Button>}
      />

      <StatTiles
        tiles={[
          {
            key: 'next7',
            label: t('upcoming.tiles.next7'),
            value: <MoneyText value={data.upcomingTotal} fractionDigits="none" />,
            note: t('upcoming.next7Note'),
          },
          {
            key: 'overdue',
            label: t('upcoming.tiles.overdue'),
            value: <MoneyText value={data.calendar.overdue} fractionDigits="none" />,
            note: t('upcoming.overdueNote'),
            tone: 'negative',
          },
          {
            key: 'lowest',
            label: t('upcoming.tiles.lowest'),
            value: <MoneyText value={data.calendar.lowestBalance} fractionDigits="none" />,
            note: t('upcoming.lowestNote'),
          },
          {
            key: 'income',
            label: t('upcoming.tiles.income'),
            value: (
              <MoneyText
                value={data.calendar.nextIncome}
                fractionDigits="none"
                signDisplay="always"
              />
            ),
            note: t('upcoming.incomeNote'),
            tone: 'positive',
          },
        ]}
      />

      <Panel title={t('upcoming.month')} meta={t('upcoming.monthNote')}>
        <div className="grid grid-cols-7 gap-1.5 text-caption font-medium text-ink-3">
          {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((day) => (
            <span key={day} className="px-1">
              {t(`days.${day}`)}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: BLANKS }, (_, index) => (
            <span key={`blank-${index}`} />
          ))}
          {Array.from({ length: DAYS_IN_MONTH }, (_, index) => {
            const day = index + 1
            const item = byDay.get(day)
            return (
              <div
                key={day}
                className={cn(
                  // Past days are not dimmed with opacity: it drags the date below the
                  // contrast floor. Today is marked instead.
                  'flex min-h-[72px] flex-col gap-1 rounded-control p-2 text-caption',
                  day === TODAY ? 'bg-accent-soft' : 'bg-inset',
                )}
              >
                <span
                  className={cn(
                    'font-medium',
                    day === TODAY ? 'text-accent' : 'text-ink-3',
                    item?.state === 'overdue' && 'text-negative',
                  )}
                >
                  {day}
                </span>
                {item && (
                  <span className="flex flex-col gap-0.5">
                    <span className="truncate text-ink">{item.name}</span>
                    <span
                      className={cn(
                        'truncate',
                        item.state === 'overdue' ? 'text-negative' : 'text-ink-3',
                      )}
                    >
                      <MoneyText value={item.amount} fractionDigits="none" />
                    </span>
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-4 text-caption text-ink-3">
          {(['paid', 'upcoming', 'estimated', 'overdue', 'income'] as const).map((key) => (
            <span key={key} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  'size-1.5 rounded-full',
                  key === 'overdue'
                    ? 'bg-negative'
                    : key === 'income'
                      ? 'bg-positive'
                      : key === 'estimated'
                        ? 'bg-ink-3'
                        : 'bg-accent',
                )}
              />
              {t(`upcoming.legend.${key}`)}
            </span>
          ))}
        </div>
      </Panel>

      <div className="flex flex-wrap gap-5">
        <Panel
          title={t('upcoming.schedule')}
          meta={t('home.comingUpRange')}
          className="flex-[1.5] basis-[30rem]"
          flush
        >
          <UpcomingList items={data.upcoming} />
          <div className="flex justify-between gap-3 px-7 text-caption text-ink-3">
            <span>{t('home.checkingAfter')}</span>
            <span className="font-medium text-ink">
              <MoneyText value={data.checkingAfterUpcoming} fractionDigits="none" />
            </span>
          </div>
        </Panel>

        <Panel title={t('upcoming.recurring')} className="flex-1 basis-[20rem]">
          <dl className="m-0 flex flex-col gap-3.5">
            {data.recurring.map((group) => (
              <div key={group.key} className="flex items-baseline justify-between gap-3 text-body">
                <dt className="text-ink-2">{t(`upcoming.recurringRows.${group.key}`)}</dt>
                <dd className="m-0 text-ink">
                  <MoneyText value={group.amount} fractionDigits="none" />
                </dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 border-t border-divider pt-3.5 text-body font-medium">
              <dt>{t('upcoming.committed')}</dt>
              <dd className="m-0">
                <MoneyText value={data.committedBeforeSpending} fractionDigits="none" />
              </dd>
            </div>
          </dl>
        </Panel>
      </div>

      <p className="m-0 text-caption text-ink-3">{t('home.sampleNote', { phase: 9 })}</p>
    </PageContainer>
  )
}
