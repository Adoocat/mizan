import {
  accountNameSchema,
  accountTypeSchema,
  institutionSchema,
  type AccountDto,
} from '@mizan/contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import type { Money } from '@mizan/domain'
import { ACCOUNT_TYPE_LIST, type AccountType } from '@mizan/domain'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { CurrencyInput } from '../../components/finance/CurrencyInput'
import { Button } from '../../components/ui/Button'
import { Dialog, DialogContent } from '../../components/ui/Dialog'
import { FormError, SelectField, TextField } from '../../components/ui/Field'
import { ApiError } from '../../lib/api-client'
import { onSubmit } from '../../lib/forms'
import { uuidv7 } from '../../lib/uuid'
import { useCreateAccount, useUpdateAccount } from './api'

const detailsSchema = z.object({
  name: accountNameSchema,
  type: accountTypeSchema,
  institution: institutionSchema,
})

type DetailsValues = z.infer<typeof detailsSchema>

function problemMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? (error.detail ?? fallback) : fallback
}

/**
 * Add or edit an account. On an edit the type and currency are fixed: changing either would
 * restate movements that are already recorded against them.
 *
 * The opening balance is not a field on the account — it is written as a dated
 * `opening_balance` transaction, which is why it only appears when adding (flow F1, step 3).
 */
export function AccountFormDialog({
  open,
  onOpenChange,
  account,
  currency,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Omitted when adding. */
  account?: AccountDto
  /** The workspace base currency: every account uses it in the MVP (decision D7). */
  currency: string
}) {
  const { t } = useTranslation()
  const editing = account !== undefined

  const create = useCreateAccount()
  const update = useUpdateAccount(account?.id ?? '')
  const mutation = editing ? update : create

  const [openingBalance, setOpeningBalance] = useState<Money | null>(null)
  /*
   * Minted once per dialog opening, and reused if the request has to be retried: the API answers a
   * repeat of the same id with the account that already exists rather than a second one.
   */
  const [newId, setNewId] = useState(() => uuidv7())

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      name: account?.name ?? '',
      type: account?.type ?? 'checking',
      institution: account?.institution ?? '',
    },
  })

  function close() {
    onOpenChange(false)
    mutation.reset()
    setOpeningBalance(null)
    setNewId(uuidv7())
    reset({
      name: account?.name ?? '',
      type: account?.type ?? 'checking',
      institution: account?.institution ?? '',
    })
  }

  const submit = handleSubmit((values) => {
    if (editing) {
      update.mutate(
        { name: values.name, institution: values.institution.trim() || null },
        { onSuccess: close },
      )
      return
    }
    create.mutate(
      {
        id: newId,
        name: values.name,
        type: values.type,
        institution: values.institution.trim() || undefined,
        ...(openingBalance && !openingBalance.isZero()
          ? { openingBalance: openingBalance.toDto() }
          : {}),
      },
      { onSuccess: close },
    )
  })

  const typeOptions = ACCOUNT_TYPE_LIST.map((value: AccountType) => ({
    value,
    label: t(`accounts.types.${value}`),
  }))

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent
        title={editing ? t('accounts.form.editTitle') : t('accounts.form.addTitle')}
        description={editing ? undefined : t('accounts.form.addLead')}
        variant="sheet"
      >
        <form noValidate onSubmit={onSubmit(submit)} className="flex flex-col gap-1">
          {mutation.error && (
            <FormError>{problemMessage(mutation.error, t('accounts.form.failed'))}</FormError>
          )}

          <TextField
            label={t('accounts.form.name')}
            autoComplete="off"
            autoFocus
            error={errors.name && t('accounts.form.nameRequired')}
            {...register('name')}
          />

          {editing ? (
            <TextField
              label={t('accounts.form.type')}
              value={t(`accounts.types.${account.type}`)}
              readOnly
              disabled
              hint={t('accounts.form.typeFixed')}
            />
          ) : (
            <SelectField
              label={t('accounts.form.type')}
              options={typeOptions}
              {...register('type')}
            />
          )}

          <TextField
            label={t('accounts.form.institution')}
            autoComplete="off"
            hint={t('accounts.form.institutionHint')}
            {...register('institution')}
          />

          {!editing && (
            <CurrencyInput
              label={t('accounts.form.openingBalance')}
              value={openingBalance}
              onChange={setOpeningBalance}
              currency={currency}
              // A credit card starts with what is owed, which is a negative balance.
              allowNegative
              hint={t('accounts.form.openingBalanceHint')}
            />
          )}

          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" loading={mutation.isPending}>
              {editing ? t('settings.save') : t('accounts.form.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
