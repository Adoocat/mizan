import { moneyFromDto, type UncoveredRecurringDto } from '@mizan/contracts'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import { Panel, panelLinkClass } from '../../components/ui/Panel'

/**
 * The warning §11 asks for: *"Netflix (Subscriptions) isn't covered by the plan"*.
 *
 * A warning and never a refusal. A category with no line of its own is covered by the pool (§10),
 * so nothing here is broken — but that money is quietly coming out of Available to spend, which
 * is exactly the surprise the plan exists to prevent. Giving the category a line makes the row
 * disappear, and so does deciding it belongs in the pool after all.
 */
export function UncoveredRecurring({
  items,
  nameOf,
}: {
  items: readonly UncoveredRecurringDto[]
  nameOf: (categoryId: string) => string
}) {
  const { t } = useTranslation()
  if (items.length === 0) return null

  return (
    <Panel
      title={t('plan.uncovered.title', { count: items.length })}
      meta={t('plan.uncovered.lead')}
      action={
        <Link to="/calendar" className={panelLinkClass}>
          {t('plan.uncovered.manage')}
        </Link>
      }
    >
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((item) => (
          <li
            key={item.ruleId}
            className="flex flex-wrap items-baseline gap-2 text-body text-ink-2"
          >
            <span className="text-ink">{item.name}</span>
            {item.categoryId && (
              <span className="text-caption text-ink-3">({nameOf(item.categoryId)})</span>
            )}
            <span className="text-ink-3">{t('plan.uncovered.body')}</span>
            <span className="ml-auto text-ink">
              <MoneyText value={moneyFromDto(item.amount)} fractionDigits="none" />
              {item.occurrences > 1 && (
                <span className="text-caption text-ink-3">
                  {' '}
                  {t('plan.uncovered.times', { count: item.occurrences })}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
