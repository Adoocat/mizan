import { periodStartDaySchema, workspaceNameSchema } from '@mizan/contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import { MAX_PERIOD_START_DAY, MIN_PERIOD_START_DAY, getCurrency } from '@mizan/domain'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button } from '../../components/ui/Button'
import { Card, CardTitle } from '../../components/ui/Card'
import { FormError, FormNotice, SelectField, TextField } from '../../components/ui/Field'
import { ApiError } from '../../lib/api-client'
import { useCurrentSession, useUpdateWorkspaceSettings } from '../auth/session'
import { onSubmit } from '../../lib/forms'

const formSchema = z.object({
  name: workspaceNameSchema,
  // A select yields a string; the API takes a number (ADR 0003: 1–28).
  periodStartDay: z.coerce.number().pipe(periodStartDaySchema),
})
type FormValues = z.input<typeof formSchema>

const START_DAYS = Array.from(
  { length: MAX_PERIOD_START_DAY - MIN_PERIOD_START_DAY + 1 },
  (_, index) => MIN_PERIOD_START_DAY + index,
)

/**
 * The workspace preferences every other screen depends on: the day the plan month starts
 * (payday) and the base currency. The currency is fixed to TRY in the MVP (decision D7).
 */
export function WorkspaceCard() {
  const { t } = useTranslation()
  const { workspace } = useCurrentSession()
  const update = useUpdateWorkspaceSettings()
  const readOnly = workspace.role === 'viewer'

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: { name: workspace.name, periodStartDay: workspace.periodStartDay },
  })

  // `mutate`, not `mutateAsync`: a rejected save belongs in `update.error`, which the form
  // already renders. Awaiting it here would surface the same failure a second time, unhandled.
  const submit = handleSubmit((values) => {
    update.mutate(
      {
        name: values.name,
        periodStartDay: Number.parseInt(String(values.periodStartDay), 10),
      },
      {
        onSuccess: (next) =>
          reset({ name: next.workspace.name, periodStartDay: next.workspace.periodStartDay }),
      },
    )
  })

  return (
    <Card className="flex max-w-md flex-col gap-4">
      <CardTitle>{t('settings.workspace.title')}</CardTitle>
      <p className="m-0 text-body text-ink-2">{t('settings.workspace.lead')}</p>

      {update.error && (
        <FormError>
          {update.error instanceof ApiError
            ? (update.error.detail ?? t('settings.saveFailed'))
            : t('settings.saveFailed')}
        </FormError>
      )}
      {update.isSuccess && !isDirty && <FormNotice>{t('settings.saved')}</FormNotice>}

      <form noValidate onSubmit={onSubmit(submit)} className="flex flex-col gap-1">
        <TextField
          label={t('settings.workspace.name')}
          disabled={readOnly}
          error={errors.name && t('settings.workspace.nameRequired')}
          {...register('name')}
        />

        <SelectField
          label={t('settings.workspace.periodStartDay')}
          hint={t('settings.workspace.periodStartDayHint')}
          disabled={readOnly}
          options={START_DAYS.map((day) => ({ value: String(day), label: String(day) }))}
          {...register('periodStartDay')}
        />

        <TextField
          label={t('settings.workspace.baseCurrency')}
          value={`${workspace.baseCurrency} · ${getCurrency(workspace.baseCurrency).symbol}`}
          readOnly
          disabled
          hint={t('settings.workspace.baseCurrencyFixed')}
        />

        {!readOnly && (
          <Button
            type="submit"
            variant="primary"
            className="mt-3 self-start"
            disabled={!isDirty}
            loading={update.isPending}
          >
            {t('settings.save')}
          </Button>
        )}
      </form>
    </Card>
  )
}
