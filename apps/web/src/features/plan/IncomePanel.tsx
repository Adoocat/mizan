import {
  moneyFromDto,
  type CreatePlanIncomeItemInput,
  type PlanIncomeItemDto,
  type PlanResponse,
} from '@mizan/contracts'
import { addDays, plainDate, type Money, type PlainDate } from '@mizan/domain'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CurrencyInput } from '../../components/finance/CurrencyInput'
import { MoneyText } from '../../components/finance/MoneyText'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { SelectField, TextField } from '../../components/ui/Field'
import { Panel } from '../../components/ui/Panel'
import { toast } from '../../components/ui/Toaster'
import { useFormatDate } from '../../lib/format-date'
import type { CategoryOption } from '../categories/names'
import { useCreateIncomeItem, useDeleteIncomeItem, useUpdateIncomeItem } from './api'

interface IncomePanelProps {
  plan: PlanResponse
  /** Income categories only: expected income has nowhere else to sit (§10). */
  options: CategoryOption[]
  namesById: Map<string, CategoryOption>
  editable: boolean
}

/**
 * The income the month is planned against (flow F2, F3).
 *
 * An item counts its expected amount until the user confirms what actually arrived; from then on
 * the confirmed figure is what the plan is built on, which is how a short salary turns into
 * "over-allocated" instead of a surprise at the end of the month.
 */
export function IncomePanel({ plan, options, namesById, editable }: IncomePanelProps) {
  const { t } = useTranslation()
  const formatDate = useFormatDate()
  const start = plan.period.start

  const create = useCreateIncomeItem(start)
  const update = useUpdateIncomeItem(start)
  const remove = useDeleteIncomeItem(start)

  const [adding, setAdding] = useState(false)

  const label = (item: PlanIncomeItemDto) =>
    item.label ?? namesById.get(item.categoryId)?.label ?? t('plan.income.untitled')

  const fail = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : t('plan.income.failed'))

  return (
    <Panel
      title={t('plan.income.title')}
      meta={t('plan.income.meta')}
      action={
        editable && !adding ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            {t('plan.income.add')}
          </Button>
        ) : undefined
      }
      className="flex-1 basis-[22rem]"
    >
      {plan.incomeItems.length === 0 && !adding && (
        <p className="m-0 text-body text-ink-2">{t('plan.income.empty')}</p>
      )}

      {plan.incomeItems.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {plan.incomeItems.map((item) => {
            const expected = moneyFromDto(item.expected)
            const received = item.received ? moneyFromDto(item.received) : null

            return (
              <li key={item.id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-body">
                  <span className="min-w-0 truncate text-ink">{label(item)}</span>
                  <span className="shrink-0 text-ink-2">
                    <MoneyText value={received ?? expected} fractionDigits="none" />
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-caption text-ink-3">
                  {item.expectedDate && <span>{formatDate(item.expectedDate)}</span>}
                  {received ? (
                    <Badge tone="positive">{t('plan.income.received')}</Badge>
                  ) : (
                    <Badge tone="estimated">{t('plan.income.expected')}</Badge>
                  )}
                  {received && !received.equals(expected) && (
                    <span>
                      {t('plan.income.insteadOf')}{' '}
                      <MoneyText value={expected} fractionDigits="none" />
                    </span>
                  )}
                  {editable && (
                    <span className="ml-auto flex items-center gap-2">
                      {received === null && (
                        <button
                          type="button"
                          className="cursor-pointer border-0 bg-transparent p-0 text-caption text-accent hover:underline"
                          onClick={() =>
                            update.mutate(
                              { id: item.id, received: item.expected },
                              { onError: fail },
                            )
                          }
                        >
                          {t('plan.income.markReceived')}
                        </button>
                      )}
                      {received !== null && (
                        <button
                          type="button"
                          className="cursor-pointer border-0 bg-transparent p-0 text-caption text-ink-3 hover:underline"
                          onClick={() =>
                            update.mutate({ id: item.id, received: null }, { onError: fail })
                          }
                        >
                          {t('plan.income.undoReceived')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="cursor-pointer border-0 bg-transparent p-0 text-caption text-ink-3 hover:underline"
                        onClick={() => remove.mutate(item.id, { onError: fail })}
                      >
                        {t('common.delete')}
                      </button>
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {adding && (
        <AddIncomeForm
          options={options}
          period={{ start: plan.period.start, end: plan.period.end }}
          pending={create.isPending}
          onCancel={() => setAdding(false)}
          onSubmit={(input) =>
            create.mutate(input, {
              onSuccess: () => setAdding(false),
              onError: fail,
            })
          }
        />
      )}
    </Panel>
  )
}

function AddIncomeForm({
  options,
  period,
  pending,
  onCancel,
  onSubmit,
}: {
  options: CategoryOption[]
  period: { start: PlainDate; end: PlainDate }
  pending: boolean
  onCancel: () => void
  onSubmit: (input: CreatePlanIncomeItemInput) => void
}) {
  const { t } = useTranslation()
  const [categoryId, setCategoryId] = useState(options[0]?.id ?? '')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState<Money | null>(null)
  const [date, setDate] = useState<string>(period.start)
  const lastDay = addDays(period.end, -1)

  const dateInRange = date === '' || (date >= period.start && date < period.end)
  const canSubmit = categoryId !== '' && amount !== null && amount.isPositive() && dateInRange

  return (
    <form
      className="flex flex-col gap-3 border-t border-divider pt-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!canSubmit || amount === null) return
        onSubmit({
          categoryId,
          ...(name.trim() ? { label: name.trim() } : {}),
          expected: amount.toDto(),
          ...(date ? { expectedDate: plainDate(date) } : {}),
        })
      }}
    >
      <SelectField
        label={t('plan.income.category')}
        value={categoryId}
        options={options.map((option) => ({ value: option.id, label: option.label }))}
        onChange={(event) => setCategoryId(event.target.value)}
      />
      <TextField
        label={t('plan.income.label')}
        value={name}
        maxLength={120}
        onChange={(event) => setName(event.target.value)}
      />
      <CurrencyInput label={t('plan.income.amount')} value={amount} onChange={setAmount} required />
      <TextField
        label={t('plan.income.date')}
        type="date"
        value={date}
        min={period.start}
        max={lastDay}
        onChange={(event) => setDate(event.target.value)}
        {...(dateInRange ? {} : { error: t('plan.income.dateOutside') })}
      />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={!canSubmit} loading={pending}>
          {t('plan.income.save')}
        </Button>
        <Button size="sm" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  )
}
