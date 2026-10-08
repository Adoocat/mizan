import {
  moneyFromDto,
  type AccountDto,
  type CreateTransactionInput,
  type TransactionDto,
  type UpdateTransactionInput,
} from '@mizan/contracts'
import { Money, splitRemainder, todayIn, type PlainDate } from '@mizan/domain'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CurrencyInput } from '../../components/finance/CurrencyInput'
import { MoneyText } from '../../components/finance/MoneyText'
import { Button } from '../../components/ui/Button'
import { Dialog, DialogContent } from '../../components/ui/Dialog'
import { FormError, SelectField, TextField } from '../../components/ui/Field'
import { ApiError } from '../../lib/api-client'
import { browserClock } from '../../lib/clock'
import { cn } from '../../lib/cn'
import { uuidv7 } from '../../lib/uuid'
import { useAccounts } from '../accounts/api'
import { useCurrentSession } from '../auth/session'
import { CategoryPicker } from '../categories/CategoryPicker'
import { useCreateTransaction, useReplaceTransaction } from './api'

type Kind = 'expense' | 'income' | 'transfer'
const KINDS: Kind[] = ['expense', 'income', 'transfer']

/** One row of the split editor. A transaction with a single part is not a split. */
interface Part {
  key: string
  amount: Money | null
  categoryId: string | null
  memo: string
}

const newPart = (): Part => ({ key: uuidv7(), amount: null, categoryId: null, memo: '' })

function partsFrom(transaction: TransactionDto, accountId: string): Part[] {
  const lines = transaction.lines.filter((line) => line.accountId === accountId)
  return lines.map((line) => ({
    key: line.id,
    // The API signs the amount; the form edits magnitudes.
    amount: moneyFromDto(line.amount).abs(),
    categoryId: line.categoryId,
    memo: line.memo ?? '',
  }))
}

/** The account a transaction was recorded against: the one it took money from, or put it in. */
function primaryAccount(transaction: TransactionDto): string {
  if (transaction.type !== 'transfer') return transaction.lines[0]!.accountId
  const outgoing = transaction.lines.find((line) => moneyFromDto(line.amount).isNegative())
  return (outgoing ?? transaction.lines[0]!).accountId
}

function transferTarget(transaction: TransactionDto): string | undefined {
  const incoming = transaction.lines.find((line) => moneyFromDto(line.amount).isPositive())
  return incoming?.accountId
}

function problemMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? (error.detail ?? fallback) : fallback
}

/**
 * Quick add, and the same form for an edit (flow F4). A sheet on a phone, a dialog on a desktop.
 *
 * Recording an expense is the most frequent thing anyone does in Mizan, so the form opens on the
 * amount with today's date already filled in, and nothing but amount, category and account is
 * required. A split is one button away and shows what is left to assign as the parts are typed;
 * the API is still the authority, and refuses a split that does not add up.
 *
 * Amounts are entered as magnitudes — 85, not −85 — and the kind decides the sign, which is
 * exactly what the API expects.
 */
export function TransactionFormDialog({
  open,
  onOpenChange,
  transaction,
  defaultKind = 'expense',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Omitted when adding. */
  transaction?: TransactionDto
  defaultKind?: Kind
}) {
  const { t } = useTranslation()
  const { workspace } = useCurrentSession()
  const editing = transaction !== undefined

  const { data: accountData } = useAccounts()
  const accounts = (accountData?.accounts ?? []).filter((account) => !account.archivedAt)

  const create = useCreateTransaction()
  const replace = useReplaceTransaction(transaction?.id ?? '')
  const mutation = editing ? replace : create

  const today = todayIn(browserClock, workspace.timezone)
  const initialAccount = transaction ? primaryAccount(transaction) : (accounts[0]?.id ?? '')

  const [kind, setKind] = useState<Kind>(
    transaction && transaction.type !== 'adjustment' && transaction.type !== 'opening_balance'
      ? transaction.type
      : defaultKind,
  )
  const [date, setDate] = useState<string>(transaction?.date ?? today)
  const [accountId, setAccountId] = useState(initialAccount)
  const [toAccountId, setToAccountId] = useState((transaction && transferTarget(transaction)) ?? '')
  const [payee, setPayee] = useState(transaction?.payee ?? '')
  const [notes, setNotes] = useState(transaction?.notes ?? '')
  const [transferCategoryId, setTransferCategoryId] = useState<string | null>(
    transaction?.lines.find((line) => line.categoryId)?.categoryId ?? null,
  )
  const [parts, setParts] = useState<Part[]>(() =>
    transaction && transaction.type !== 'transfer'
      ? partsFrom(transaction, primaryAccount(transaction))
      : [newPart()],
  )
  const [transferAmount, setTransferAmount] = useState<Money | null>(() =>
    transaction?.type === 'transfer' ? moneyFromDto(transaction.total).abs() : null,
  )
  /** Minted once per opening, so a retry or a double tap cannot record the same expense twice. */
  const [newId, setNewId] = useState(() => uuidv7())
  const [showErrors, setShowErrors] = useState(false)

  const account = accounts.find((candidate) => candidate.id === accountId)
  const target = accounts.find((candidate) => candidate.id === toAccountId)
  const base = workspace.baseCurrency

  const isSplit = parts.length > 1
  const splitTotal = Money.sum(
    parts.map((part) => part.amount ?? Money.zero(base)),
    base,
  )
  /*
   * Splitting a transaction that already exists has a known total to divide up, so the editor can
   * say what is still unassigned (the 1,600 TL supermarket split of flow F4). A brand-new
   * transaction has no total until its parts are typed, so there is only a running sum.
   */
  const originalTotal = transaction ? moneyFromDto(transaction.total).abs() : null
  const unassigned =
    originalTotal && isSplit
      ? splitRemainder(
          originalTotal,
          parts.map((part) => part.amount ?? Money.zero(base)),
        )
      : null

  function close() {
    onOpenChange(false)
    mutation.reset()
    setShowErrors(false)
    setNewId(uuidv7())
  }

  /** A category is only needed where the plan can see the money (§10). */
  const categoryNeeded = kind !== 'transfer' && (account?.onBudget ?? true)
  const transferLeavesBudget = Boolean(account && target && account.onBudget && !target.onBudget)

  const problems = {
    account: accountId.length === 0,
    toAccount: kind === 'transfer' && (toAccountId.length === 0 || toAccountId === accountId),
    transferAmount:
      kind === 'transfer' && (transferAmount === null || !transferAmount.isPositive()),
    parts:
      kind !== 'transfer' &&
      parts.some((part) => part.amount === null || !part.amount.isPositive()),
    categories:
      kind !== 'transfer' && categoryNeeded && parts.some((part) => part.categoryId === null),
    transferCategory: transferLeavesBudget && transferCategoryId === null,
  }
  const invalid = Object.values(problems).some(Boolean)

  function submit() {
    setShowErrors(true)
    if (invalid) return

    const body: CreateTransactionInput | UpdateTransactionInput =
      kind === 'transfer'
        ? {
            type: 'transfer',
            date: date as PlainDate,
            fromAccountId: accountId,
            toAccountId,
            amount: transferAmount!.toDto(),
            ...(transferLeavesBudget && transferCategoryId
              ? { categoryId: transferCategoryId }
              : {}),
            ...(payee.trim() ? { payee: payee.trim() } : {}),
            ...(notes.trim() ? { notes: notes.trim() } : {}),
          }
        : {
            type: kind,
            date: date as PlainDate,
            accountId,
            parts: parts.map((part) => ({
              amount: part.amount!.toDto(),
              ...(part.categoryId ? { categoryId: part.categoryId } : {}),
              ...(part.memo.trim() ? { memo: part.memo.trim() } : {}),
            })),
            ...(payee.trim() ? { payee: payee.trim() } : {}),
            ...(notes.trim() ? { notes: notes.trim() } : {}),
          }

    if (editing) {
      replace.mutate(body, { onSuccess: close })
      return
    }
    create.mutate({ ...(body as CreateTransactionInput), id: newId }, { onSuccess: close })
  }

  const accountOptions = accounts.map((candidate: AccountDto) => ({
    value: candidate.id,
    label: candidate.name,
  }))

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent
        title={editing ? t('transactions.form.editTitle') : t(`transactions.form.add.${kind}`)}
        variant="sheet"
        className="md:max-w-lg"
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
            <FormError>{problemMessage(mutation.error, t('transactions.form.failed'))}</FormError>
          )}

          <div
            role="group"
            aria-label={t('transactions.form.kind')}
            className="mb-2 flex gap-1 rounded-full bg-inset p-1"
          >
            {KINDS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={kind === option}
                onClick={() => setKind(option)}
                className={cn(
                  'h-8 flex-1 cursor-pointer rounded-full text-label font-medium transition-colors duration-150 ease-mizan',
                  kind === option ? 'bg-surface text-ink' : 'text-ink-2 hover:text-ink',
                )}
              >
                {t(`transactions.kinds.${option}`)}
              </button>
            ))}
          </div>

          {accounts.length === 0 ? (
            <p className="m-0 text-body text-ink-2">{t('transactions.form.noAccounts')}</p>
          ) : (
            <>
              {kind === 'transfer' ? (
                <>
                  <CurrencyInput
                    label={t('transactions.form.amount')}
                    value={transferAmount}
                    onChange={setTransferAmount}
                    currency={base}
                    required
                    autoFocus
                  />
                  <SelectField
                    label={t('transactions.form.from')}
                    options={accountOptions}
                    value={accountId}
                    onChange={(event) => setAccountId(event.target.value)}
                  />
                  <SelectField
                    label={t('transactions.form.to')}
                    options={accountOptions}
                    value={toAccountId}
                    onChange={(event) => setToAccountId(event.target.value)}
                    error={
                      showErrors && problems.toAccount
                        ? t('transactions.form.pickAnotherAccount')
                        : undefined
                    }
                  />
                  {transferLeavesBudget && (
                    <CategoryPicker
                      label={t('transactions.form.category')}
                      value={transferCategoryId}
                      onChange={setTransferCategoryId}
                      error={
                        showErrors && problems.transferCategory
                          ? t('transactions.form.categoryRequired')
                          : undefined
                      }
                    />
                  )}
                </>
              ) : (
                <>
                  {parts.map((part, index) => (
                    <div
                      key={part.key}
                      className={cn(
                        'flex flex-col gap-1',
                        isSplit && 'rounded-inset bg-inset/60 p-3',
                      )}
                    >
                      {isSplit && (
                        <div className="flex items-center justify-between">
                          <span className="text-label text-ink-3">
                            {t('transactions.form.part', { number: index + 1 })}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setParts((current) =>
                                current.filter((candidate) => candidate.key !== part.key),
                              )
                            }
                            className="cursor-pointer text-caption text-accent hover:underline"
                          >
                            {t('transactions.form.removePart')}
                          </button>
                        </div>
                      )}
                      <CurrencyInput
                        label={t('transactions.form.amount')}
                        value={part.amount}
                        onChange={(amount) =>
                          setParts((current) =>
                            current.map((candidate) =>
                              candidate.key === part.key ? { ...candidate, amount } : candidate,
                            ),
                          )
                        }
                        currency={base}
                        required
                        autoFocus={index === 0}
                      />
                      {categoryNeeded && (
                        <CategoryPicker
                          label={t('transactions.form.category')}
                          value={part.categoryId}
                          onChange={(categoryId) =>
                            setParts((current) =>
                              current.map((candidate) =>
                                candidate.key === part.key
                                  ? { ...candidate, categoryId }
                                  : candidate,
                              ),
                            )
                          }
                          error={
                            showErrors && part.categoryId === null
                              ? t('transactions.form.categoryRequired')
                              : undefined
                          }
                        />
                      )}
                      {isSplit && (
                        <TextField
                          label={t('transactions.form.memo')}
                          value={part.memo}
                          autoComplete="off"
                          onChange={(event) =>
                            setParts((current) =>
                              current.map((candidate) =>
                                candidate.key === part.key
                                  ? { ...candidate, memo: event.target.value }
                                  : candidate,
                              ),
                            )
                          }
                        />
                      )}
                    </div>
                  ))}

                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setParts((current) => [...current, newPart()])}
                    >
                      {t('transactions.form.addPart')}
                    </Button>
                    {isSplit && (
                      <span className="text-label text-ink-2">
                        {unassigned && !unassigned.isZero() ? (
                          <>
                            {t('transactions.form.unassigned')}{' '}
                            <MoneyText value={unassigned} tone="signed" />
                          </>
                        ) : (
                          <>
                            {t('transactions.form.splitTotal')}{' '}
                            <MoneyText value={splitTotal} tone="neutral" />
                          </>
                        )}
                      </span>
                    )}
                  </div>

                  <SelectField
                    label={t('transactions.form.account')}
                    options={accountOptions}
                    value={accountId}
                    onChange={(event) => setAccountId(event.target.value)}
                  />
                </>
              )}

              <TextField
                label={t('transactions.form.date')}
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />

              <TextField
                label={t('transactions.form.payee')}
                value={payee}
                autoComplete="off"
                onChange={(event) => setPayee(event.target.value)}
              />

              <TextField
                label={t('transactions.form.notes')}
                value={notes}
                autoComplete="off"
                onChange={(event) => setNotes(event.target.value)}
              />
            </>
          )}

          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={mutation.isPending}
              disabled={accounts.length === 0}
            >
              {editing ? t('settings.save') : t('transactions.form.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
