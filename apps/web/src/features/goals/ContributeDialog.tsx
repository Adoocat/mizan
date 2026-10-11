import { moneyFromDto, type GoalDto } from '@mizan/contracts'
import { checkContribution, goalProgress, goalSaved, Money, releasableAmount } from '@mizan/domain'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CurrencyInput } from '../../components/finance/CurrencyInput'
import { MoneyText } from '../../components/finance/MoneyText'
import { PercentText } from '../../components/finance/PercentText'
import { Button } from '../../components/ui/Button'
import { Dialog, DialogContent } from '../../components/ui/Dialog'
import { FormError, FormNotice, TextField } from '../../components/ui/Field'
import { ApiError } from '../../lib/api-client'
import { uuidv7 } from '../../lib/uuid'
import { useContribute } from './api'

type Direction = 'earmark' | 'release'

function problemMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? (error.detail ?? fallback) : fallback
}

/**
 * Earmark money for a goal, or release it back (flow F8).
 *
 * One dialog for both directions, because they are the same act: the amount is signed on the way
 * out. Nothing moves between accounts either way — a contribution is a statement about money the
 * user already has, which the copy says plainly so nobody expects a transfer to appear.
 *
 * The preview runs the **same domain functions the API will**, so what it promises and what gets
 * saved cannot disagree (§9).
 */
export function ContributeDialog({
  open,
  onOpenChange,
  goal,
  currency,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  goal: GoalDto
  currency: string
}) {
  const { t } = useTranslation()
  const [direction, setDirection] = useState<Direction>('earmark')
  const [amount, setAmount] = useState<Money | null>(null)
  const [note, setNote] = useState('')
  const [newId, setNewId] = useState(() => uuidv7())

  const mutation = useContribute(goal.id)

  const saved = moneyFromDto(goal.saved)
  const target = moneyFromDto(goal.target)
  const signed = amount === null ? null : direction === 'release' ? amount.negate() : amount

  // The figures this contribution would leave behind, from the same functions the API runs.
  const after =
    signed === null
      ? null
      : goalSaved({ earmarked: saved.plus(signed), spent: Money.zero(currency) })
  const check = signed === null ? null : checkContribution({ amount: signed, saved })
  const progressAfter = after === null ? null : goalProgress({ target, saved: after })

  function close() {
    onOpenChange(false)
    mutation.reset()
    setAmount(null)
    setNote('')
    setDirection('earmark')
    setNewId(uuidv7())
  }

  function submit() {
    if (!signed || !check?.ok) return
    mutation.mutate(
      {
        id: newId,
        amount: signed.toDto(),
        ...(note.trim() ? { note: note.trim() } : {}),
      },
      { onSuccess: close },
    )
  }

  const refusal =
    check && !check.ok && check.refusal === 'moreThanSaved'
      ? t('goals.contribute.moreThanSaved')
      : null

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent
        title={t('goals.contribute.title', { name: goal.name })}
        description={t('goals.contribute.lead')}
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
            <FormError>{problemMessage(mutation.error, t('goals.contribute.failed'))}</FormError>
          )}

          <div
            role="radiogroup"
            aria-label={t('goals.contribute.direction')}
            className="mb-1 flex gap-2"
          >
            {(['earmark', 'release'] as const).map((value) => (
              <Button
                key={value}
                role="radio"
                variant={direction === value ? 'primary' : 'secondary'}
                aria-checked={direction === value}
                onClick={() => {
                  setDirection(value)
                  setAmount(null)
                }}
              >
                {t(`goals.contribute.${value}`)}
              </Button>
            ))}
          </div>

          <CurrencyInput
            label={t(`goals.contribute.${direction}Amount`)}
            value={amount}
            onChange={setAmount}
            currency={currency}
            required
            autoFocus
            hint={
              direction === 'release'
                ? t('goals.contribute.releaseHint')
                : t('goals.contribute.earmarkHint')
            }
          />

          {direction === 'release' && (
            <FormNotice>
              {t('goals.contribute.releasable')}{' '}
              <MoneyText value={releasableAmount(saved)} fractionDigits="none" />
            </FormNotice>
          )}

          {refusal && <FormError>{refusal}</FormError>}

          {after && check?.ok && (
            <FormNotice>
              {t('goals.contribute.preview')} <MoneyText value={after} fractionDigits="none" />{' '}
              {t('goals.of')} <MoneyText value={target} fractionDigits="none" />
              {progressAfter && (
                <>
                  {' · '}
                  <PercentText value={progressAfter} fractionDigits={0} />
                </>
              )}
            </FormNotice>
          )}

          <TextField
            label={t('goals.contribute.note')}
            autoComplete="off"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />

          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={mutation.isPending}
              disabled={!check?.ok}
            >
              {t(`goals.contribute.${direction}Submit`)}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
