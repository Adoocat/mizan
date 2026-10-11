import { zodResolver } from '@hookform/resolvers/zod'
import { goalNameSchema, goalNoteSchema, type AccountDto, type GoalDto } from '@mizan/contracts'
import {
  EMERGENCY_FUND_MONTHS,
  GOAL_REPEATS,
  GOAL_TYPES,
  type EmergencyFundMonths,
  type GoalType,
  type Money,
  type PlainDate,
} from '@mizan/domain'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { CurrencyInput } from '../../components/finance/CurrencyInput'
import { MoneyText } from '../../components/finance/MoneyText'
import { Button } from '../../components/ui/Button'
import { Dialog, DialogContent } from '../../components/ui/Dialog'
import { FormError, FormNotice, SelectField, TextField } from '../../components/ui/Field'
import { ApiError } from '../../lib/api-client'
import { onSubmit } from '../../lib/forms'
import { uuidv7 } from '../../lib/uuid'
import { useCreateGoal, useUpdateGoal } from './api'

/** What the repeat `<select>` carries when a sinking fund does not come round again. */
const NO_REPEAT = 'none'

const detailsSchema = z.object({
  name: goalNameSchema,
  note: goalNoteSchema,
  /** Empty, or a `YYYY-MM-DD` the date input produced; cast at the submit boundary. */
  targetDate: z.string(),
  emergencyMonths: z.enum(EMERGENCY_FUND_MONTHS.map(String) as [string, ...string[]]),
  repeat: z.enum([NO_REPEAT, ...GOAL_REPEATS]),
})

type DetailsValues = z.infer<typeof detailsSchema>

function problemMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? (error.detail ?? fallback) : fallback
}

/** The months of cover, as the `<select>` carries them: strings. */
const monthsFrom = (value: string): EmergencyFundMonths =>
  EMERGENCY_FUND_MONTHS.find((months) => String(months) === value) ?? EMERGENCY_FUND_MONTHS[1]

/**
 * Add or edit a goal (flow F7).
 *
 * The type is chosen first and then fixed, because the three types keep their targets in
 * different ways: an emergency fund's comes from the plan's essentials, a sinking fund has a date
 * its bill falls due, and a savings goal may have neither. Turning one into another is a new goal,
 * not an edit — so the selector disappears once the goal exists.
 */
export function GoalFormDialog({
  open,
  onOpenChange,
  goal,
  currency,
  accounts,
  essentialMonthly,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Omitted when adding. */
  goal?: GoalDto
  /** The workspace base currency: every goal uses it in the MVP (decision D7). */
  currency: string
  /** On-budget accounts a goal can say it is kept in, for the over-earmark warning (§9). */
  accounts: readonly AccountDto[]
  /** One month of planned essentials, which is what an emergency fund's target is built from. */
  essentialMonthly: Money
}) {
  const { t } = useTranslation()
  const editing = goal !== undefined

  const create = useCreateGoal()
  const update = useUpdateGoal(goal?.id ?? '')
  const mutation = editing ? update : create

  const [type, setType] = useState<GoalType>(goal?.type ?? 'savings')
  const [target, setTarget] = useState<Money | null>(null)
  const [keptIn, setKeptIn] = useState(goal?.keptInAccountId ?? '')
  /*
   * Minted once per dialog opening and reused on a retry: the API answers a repeat of the same id
   * with the goal that already exists rather than a second one.
   */
  const [newId, setNewId] = useState(() => uuidv7())

  const defaults = (): DetailsValues => ({
    name: goal?.name ?? '',
    note: goal?.note ?? '',
    targetDate: goal?.targetDate ?? '',
    emergencyMonths: String(goal?.emergencyMonths ?? 3),
    repeat: goal?.repeat ?? NO_REPEAT,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DetailsValues>({ resolver: zodResolver(detailsSchema), defaultValues: defaults() })

  function close() {
    onOpenChange(false)
    mutation.reset()
    setTarget(null)
    setType(goal?.type ?? 'savings')
    setKeptIn(goal?.keptInAccountId ?? '')
    setNewId(uuidv7())
    reset(defaults())
  }

  const submit = handleSubmit((values) => {
    const note = values.note.trim() || undefined
    const keptInAccountId = keptIn || undefined
    // The date input yields `YYYY-MM-DD`, which the API validates again on arrival.
    const targetDate = values.targetDate ? (values.targetDate as PlainDate) : null
    const months = monthsFrom(values.emergencyMonths)

    if (editing) {
      update.mutate(
        {
          name: values.name,
          note: note ?? null,
          keptInAccountId: keptIn || null,
          ...(goal.type === 'emergency_fund'
            ? { emergencyMonths: months }
            : {
                ...(target ? { target: target.toDto() } : {}),
                ...(goal.type === 'sinking_fund'
                  ? {
                      // A sinking fund's date can be moved but never cleared.
                      ...(targetDate ? { targetDate } : {}),
                      repeat: values.repeat === NO_REPEAT ? null : values.repeat,
                    }
                  : { targetDate }),
              }),
        },
        { onSuccess: close },
      )
      return
    }

    if (type === 'emergency_fund') {
      create.mutate(
        {
          type: 'emergency_fund',
          id: newId,
          name: values.name,
          ...(note ? { note } : {}),
          ...(keptInAccountId ? { keptInAccountId } : {}),
          emergencyMonths: months,
        },
        { onSuccess: close },
      )
      return
    }

    // Both remaining types need a target; the field is required, so this is the empty-input case.
    if (!target || target.isZero()) return

    if (type === 'sinking_fund') {
      // A bill without a date is not a sinking fund; the field is required.
      if (!targetDate) return
      create.mutate(
        {
          type: 'sinking_fund',
          id: newId,
          name: values.name,
          ...(note ? { note } : {}),
          ...(keptInAccountId ? { keptInAccountId } : {}),
          target: target.toDto(),
          targetDate,
          ...(values.repeat === NO_REPEAT ? {} : { repeat: values.repeat }),
        },
        { onSuccess: close },
      )
      return
    }

    create.mutate(
      {
        type: 'savings',
        id: newId,
        name: values.name,
        ...(note ? { note } : {}),
        ...(keptInAccountId ? { keptInAccountId } : {}),
        target: target.toDto(),
        ...(targetDate ? { targetDate } : {}),
      },
      { onSuccess: close },
    )
  })

  const shownType = editing ? goal.type : type

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent
        title={editing ? t('goals.form.editTitle') : t('goals.form.addTitle')}
        description={editing ? undefined : t('goals.form.addLead')}
        variant="sheet"
      >
        <form noValidate onSubmit={onSubmit(submit)} className="flex flex-col gap-1">
          {mutation.error && (
            <FormError>{problemMessage(mutation.error, t('goals.form.failed'))}</FormError>
          )}

          {editing ? (
            <TextField
              label={t('goals.form.type')}
              value={t(`goals.types.${goal.type}`)}
              readOnly
              disabled
              hint={t('goals.form.typeFixed')}
            />
          ) : (
            <SelectField
              label={t('goals.form.type')}
              value={type}
              onChange={(event) => setType(event.target.value as GoalType)}
              options={GOAL_TYPES.map((value) => ({
                value,
                label: t(`goals.types.${value}`),
              }))}
              hint={t(`goals.form.typeHint.${type}`)}
            />
          )}

          <TextField
            label={t('goals.form.name')}
            autoComplete="off"
            autoFocus
            error={errors.name && t('goals.form.nameRequired')}
            {...register('name')}
          />

          {shownType === 'emergency_fund' ? (
            <>
              <SelectField
                label={t('goals.form.months')}
                options={EMERGENCY_FUND_MONTHS.map((months) => ({
                  value: String(months),
                  label: t('goals.form.monthsOption', { count: months }),
                }))}
                {...register('emergencyMonths')}
              />
              <FormNotice>
                {t('goals.form.derivedTarget')}{' '}
                <MoneyText value={essentialMonthly} fractionDigits="none" />{' '}
                {t('goals.form.derivedTargetSuffix')}
              </FormNotice>
            </>
          ) : (
            <CurrencyInput
              label={t('goals.form.target')}
              value={target ?? (editing ? null : null)}
              onChange={setTarget}
              currency={currency}
              required={!editing}
              hint={editing ? t('goals.form.targetEditHint') : undefined}
            />
          )}

          {shownType === 'sinking_fund' && (
            <>
              <TextField
                label={t('goals.form.dueDate')}
                type="date"
                hint={t('goals.form.dueDateHint')}
                {...register('targetDate')}
              />
              <SelectField
                label={t('goals.form.repeat')}
                options={[
                  { value: NO_REPEAT, label: t('goals.form.repeatNone') },
                  ...GOAL_REPEATS.map((value) => ({
                    value,
                    label: t(`goals.repeats.${value}`),
                  })),
                ]}
                hint={t('goals.form.repeatHint')}
                {...register('repeat')}
              />
            </>
          )}

          {shownType === 'savings' && (
            <TextField
              label={t('goals.form.targetDate')}
              type="date"
              hint={t('goals.form.targetDateHint')}
              {...register('targetDate')}
            />
          )}

          <SelectField
            label={t('goals.form.keptIn')}
            value={keptIn}
            onChange={(event) => setKeptIn(event.target.value)}
            options={[
              { value: '', label: t('goals.form.keptInNone') },
              ...accounts.map((account) => ({ value: account.id, label: account.name })),
            ]}
            hint={t('goals.form.keptInHint')}
          />

          <TextField label={t('goals.form.note')} autoComplete="off" {...register('note')} />

          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" loading={mutation.isPending}>
              {editing ? t('settings.save') : t('goals.form.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
