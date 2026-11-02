import { moneyFromDto, type OccurrenceDto } from '@mizan/contracts'
import type { Money, PlainDate } from '@mizan/domain'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CurrencyInput } from '../../components/finance/CurrencyInput'
import { Button } from '../../components/ui/Button'
import { Dialog, DialogContent } from '../../components/ui/Dialog'
import { FormError, FormNotice, TextField } from '../../components/ui/Field'
import { ApiError } from '../../lib/api-client'
import { uuidv7 } from '../../lib/uuid'
import { useConfirmOccurrence } from './api'

function problemMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? (error.detail ?? fallback) : fallback
}

/**
 * Confirms one occurrence: the money actually moved (flow F6).
 *
 * The amount is prefilled and editable, which is the whole point for an estimated bill — the
 * electricity was ₺812.40, not the ₺720 the plan guessed. The transaction id is generated here
 * and sent with the request, so a double tap or a retry cannot pay the bill twice (§12), on top
 * of the unique index the API relies on.
 */
export function ConfirmOccurrenceDialog({
  open,
  onOpenChange,
  occurrence,
  currency,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  occurrence: OccurrenceDto
  currency: string
}) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState<Money | null>(() => moneyFromDto(occurrence.amount))
  const [date, setDate] = useState<string>(occurrence.dueDate)
  const [transactionId, setTransactionId] = useState(() => uuidv7())

  const mutation = useConfirmOccurrence(occurrence.ruleId)

  function close() {
    onOpenChange(false)
    mutation.reset()
    setAmount(moneyFromDto(occurrence.amount))
    setDate(occurrence.dueDate)
    setTransactionId(uuidv7())
  }

  function submit() {
    if (!amount || !amount.isPositive()) return
    mutation.mutate(
      {
        // The occurrence's own series date addresses it; `date` is when the money moved.
        occurrenceDate: occurrence.originalDate,
        transactionId,
        amount: amount.toDto(),
        ...(date && date !== occurrence.dueDate ? { date: date as PlainDate } : {}),
      },
      { onSuccess: close },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent
        title={t('recurring.confirm.title', { name: occurrence.ruleName })}
        description={t(`recurring.confirm.lead.${occurrence.kind}`)}
        variant="sheet"
      >
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
          className="flex flex-col gap-1"
        >
          {mutation.error && (
            <FormError>{problemMessage(mutation.error, t('recurring.confirm.failed'))}</FormError>
          )}

          {occurrence.estimated && <FormNotice>{t('recurring.confirm.estimatedHint')}</FormNotice>}

          <CurrencyInput
            label={t('recurring.confirm.amount')}
            value={amount}
            onChange={setAmount}
            currency={currency}
            required
            autoFocus
          />

          <TextField
            label={t('recurring.confirm.date')}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            hint={t('recurring.confirm.dateHint')}
          />

          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={mutation.isPending}
              disabled={!amount?.isPositive()}
            >
              {t('recurring.confirm.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
