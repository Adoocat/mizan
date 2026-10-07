import { moneyFromDto, type AccountDto } from '@mizan/contracts'
import type { Money } from '@mizan/domain'
import { reconcileAdjustment } from '@mizan/domain'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CurrencyInput } from '../../components/finance/CurrencyInput'
import { MoneyText } from '../../components/finance/MoneyText'
import { Button } from '../../components/ui/Button'
import { Dialog, DialogContent } from '../../components/ui/Dialog'
import { FormError } from '../../components/ui/Field'
import { toast } from '../../components/ui/Toaster'
import { ApiError } from '../../lib/api-client'
import { useReconcileAccount } from './api'

/**
 * Reconciling: the user types the balance their statement shows and Mizan writes the single
 * adjustment that closes the gap.
 *
 * The difference is previewed live with the same domain function the API uses, so the number on
 * screen and the number written are the same calculation — but the API stays authoritative, and
 * what it returns is what the toast reports.
 */
export function ReconcileDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: AccountDto
}) {
  const { t } = useTranslation()
  const reconcile = useReconcileAccount(account.id)
  const [statement, setStatement] = useState<Money | null>(null)

  const derived = moneyFromDto(account.balance)
  const preview = statement ? reconcileAdjustment(derived, statement) : null

  function close() {
    onOpenChange(false)
    reconcile.reset()
    setStatement(null)
  }

  function submit() {
    if (!statement) return
    reconcile.mutate(
      { statementBalance: statement.toDto() },
      {
        onSuccess: (result) => {
          const adjustment = moneyFromDto(result.adjustment)
          toast(
            adjustment.isZero()
              ? t('accounts.reconcile.alreadyMatched')
              : t('accounts.reconcile.adjusted'),
          )
          close()
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent
        title={t('accounts.reconcile.title', { name: account.name })}
        description={t('accounts.reconcile.lead')}
        variant="sheet"
      >
        {reconcile.error && (
          <FormError>
            {reconcile.error instanceof ApiError
              ? (reconcile.error.detail ?? t('accounts.reconcile.failed'))
              : t('accounts.reconcile.failed')}
          </FormError>
        )}

        <dl className="m-0 flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-body text-ink-2">{t('accounts.reconcile.inMizan')}</dt>
            <dd className="m-0 text-value-s text-ink">
              <MoneyText value={derived} tone="overspent" />
            </dd>
          </div>
        </dl>

        <CurrencyInput
          label={t('accounts.reconcile.statementBalance')}
          value={statement}
          onChange={setStatement}
          currency={account.currency}
          allowNegative
          autoFocus
          hint={t('accounts.reconcile.statementHint')}
        />

        <div
          aria-live="polite"
          className="flex items-baseline justify-between gap-4 rounded-inset bg-inset px-4 py-3"
        >
          <span className="text-body text-ink-2">{t('accounts.reconcile.difference')}</span>
          <span className="text-value-s text-ink">
            {preview ? (
              preview.isZero() ? (
                t('accounts.reconcile.noDifference')
              ) : (
                <MoneyText value={preview} tone="signed" signDisplay="always" />
              )
            ) : (
              '—'
            )}
          </span>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={statement === null}
            loading={reconcile.isPending}
          >
            {t('accounts.reconcile.submit')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
