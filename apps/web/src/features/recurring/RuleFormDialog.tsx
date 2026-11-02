import {
  moneyFromDto,
  type AccountDto,
  type CreateRecurringRuleInput,
  type GoalDto,
  type RecurringRuleDto,
  type UpdateRecurringRuleInput,
} from '@mizan/contracts'
import {
  monthlyEquivalent,
  type AmountMode,
  type Money,
  type PlainDate,
  type RecurrenceFrequency,
  type RecurringRuleKind,
  type WeekendPolicy,
} from '@mizan/domain'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CurrencyInput } from '../../components/finance/CurrencyInput'
import { MoneyText } from '../../components/finance/MoneyText'
import { Button } from '../../components/ui/Button'
import { Dialog, DialogContent } from '../../components/ui/Dialog'
import { FormError, FormNotice, SelectField, TextField } from '../../components/ui/Field'
import { ApiError } from '../../lib/api-client'
import { uuidv7 } from '../../lib/uuid'
import { CategoryPicker } from '../categories/CategoryPicker'
import { useCreateRule, useUpdateRule } from './api'

const KINDS: readonly RecurringRuleKind[] = ['expense', 'income', 'transfer']
const FREQUENCIES: readonly RecurrenceFrequency[] = ['monthly', 'weekly', 'yearly', 'daily']
const WEEKEND_POLICIES: readonly WeekendPolicy[] = [
  'none',
  'previous_business_day',
  'next_business_day',
]

function problemMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? (error.detail ?? fallback) : fallback
}

interface FormState {
  kind: RecurringRuleKind
  name: string
  payee: string
  amount: Money | null
  amountMode: AmountMode
  accountId: string
  toAccountId: string
  categoryId: string | null
  goalId: string
  freq: RecurrenceFrequency
  interval: string
  startDate: string
  byMonthDay: string
  weekendPolicy: WeekendPolicy
  endDate: string
  autoPost: boolean
}

function initialState(
  rule: RecurringRuleDto | undefined,
  accounts: readonly AccountDto[],
  today: PlainDate,
): FormState {
  if (rule) {
    return {
      kind: rule.kind,
      name: rule.name,
      payee: rule.payee ?? '',
      amount: moneyFromDto(rule.amount),
      amountMode: rule.amountMode,
      accountId: rule.accountId,
      toAccountId: rule.toAccountId ?? '',
      categoryId: rule.categoryId,
      goalId: rule.goalId ?? '',
      freq: rule.freq,
      interval: String(rule.interval),
      startDate: rule.startDate,
      byMonthDay: rule.byMonthDay === null ? '' : String(rule.byMonthDay),
      weekendPolicy: rule.weekendPolicy,
      endDate: rule.endDate ?? '',
      autoPost: rule.autoPost,
    }
  }

  return {
    kind: 'expense',
    name: '',
    payee: '',
    amount: null,
    amountMode: 'fixed',
    accountId: accounts[0]?.id ?? '',
    toAccountId: '',
    categoryId: null,
    goalId: '',
    freq: 'monthly',
    interval: '1',
    startDate: today,
    byMonthDay: '',
    weekendPolicy: 'none',
    endDate: '',
    autoPost: false,
  }
}

/**
 * The rule editor (PLAN §11, flow F6).
 *
 * One form for all three kinds, because they differ in two fields rather than in shape: a
 * transfer swaps its category for a destination account. The schedule is the part worth getting
 * right — a day of the month that clamps in February, and a weekend policy — so those sit
 * together under their own heading rather than being mixed in with the amount.
 *
 * Editing offers the choice §11 asks for: the whole series, or this month onwards. It is a real
 * choice and not a default, because getting it wrong rewrites history — raising the rent for
 * "all" would restate what June's rent was.
 */
export function RuleFormDialog({
  open,
  onOpenChange,
  rule,
  currency,
  accounts,
  goals,
  today,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule?: RecurringRuleDto
  currency: string
  accounts: readonly AccountDto[]
  goals: readonly GoalDto[]
  today: PlainDate
}) {
  const { t } = useTranslation()
  const [form, setForm] = useState<FormState>(() => initialState(rule, accounts, today))
  const [scope, setScope] = useState<'all' | 'future'>('all')
  const [newId, setNewId] = useState(() => uuidv7())

  const create = useCreateRule()
  const update = useUpdateRule(rule?.id ?? '')
  const mutation = rule ? update : create

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((state) => ({ ...state, [key]: value }))

  function close() {
    onOpenChange(false)
    mutation.reset()
    setForm(initialState(rule, accounts, today))
    setScope('all')
    setNewId(uuidv7())
  }

  /*
   * The account to use when the form has not been touched.
   *
   * `initialState` runs when this component first mounts, which is before the dialog is opened and
   * usually before the accounts have arrived — so the stored value can be empty while a perfectly
   * good default is on screen. Resolving it here rather than in an effect keeps one source of
   * truth and means the form is submittable the moment it is readable.
   */
  const accountId = form.accountId || (accounts[0]?.id ?? '')
  const onBudget = accounts.find((account) => account.id === accountId)?.onBudget ?? true

  const interval = Number.parseInt(form.interval, 10)
  const validInterval = Number.isInteger(interval) && interval >= 1 && interval <= 365
  const needsDestination = form.kind === 'transfer'
  const needsCategory = form.kind !== 'transfer'

  const ready =
    form.name.trim().length > 0 &&
    form.amount !== null &&
    form.amount.isPositive() &&
    accountId.length > 0 &&
    validInterval &&
    form.startDate.length > 0 &&
    (!needsDestination || (form.toAccountId.length > 0 && form.toAccountId !== accountId)) &&
    // An on-budget payment needs a category, the same way the transaction it becomes does (§10).
    (!needsCategory || !onBudget || form.categoryId !== null)

  /** What this rule costs in an average month, from the same function the API runs. */
  const perMonth =
    form.amount && validInterval
      ? monthlyEquivalent({ freq: form.freq, interval, amount: form.amount })
      : null

  function submit() {
    if (!ready || !form.amount) return

    const schedule = {
      freq: form.freq,
      interval,
      startDate: form.startDate as PlainDate,
      weekendPolicy: form.weekendPolicy,
      amountMode: form.amountMode,
      autoPost: form.autoPost && form.amountMode === 'fixed',
      ...(form.freq === 'monthly' && form.byMonthDay
        ? { byMonthDay: Number.parseInt(form.byMonthDay, 10) }
        : {}),
      ...(form.endDate ? { endDate: form.endDate as PlainDate } : {}),
    }

    if (rule) {
      const patch: UpdateRecurringRuleInput = {
        ...schedule,
        name: form.name.trim(),
        payee: form.payee.trim() || null,
        amount: form.amount.toDto(),
        accountId,
        goalId: form.goalId || null,
        byMonthDay:
          form.freq === 'monthly' && form.byMonthDay ? Number.parseInt(form.byMonthDay, 10) : null,
        endDate: form.endDate ? (form.endDate as PlainDate) : null,
        ...(needsDestination ? { toAccountId: form.toAccountId } : {}),
        ...(needsCategory ? { categoryId: form.categoryId } : {}),
        // "This and future" applies from the start of the month being planned onwards.
        ...(scope === 'future' ? { scope: 'future' as const, from: today } : {}),
      }
      update.mutate(patch, { onSuccess: close })
      return
    }

    const base = {
      id: newId,
      name: form.name.trim(),
      amount: form.amount.toDto(),
      accountId,
      ...schedule,
      ...(form.payee.trim() ? { payee: form.payee.trim() } : {}),
      ...(form.goalId ? { goalId: form.goalId } : {}),
    }

    const input: CreateRecurringRuleInput = needsDestination
      ? { ...base, kind: 'transfer', toAccountId: form.toAccountId }
      : {
          ...base,
          kind: form.kind === 'income' ? 'income' : 'expense',
          ...(form.categoryId ? { categoryId: form.categoryId } : {}),
        }

    create.mutate(input, { onSuccess: close })
  }

  const accountOptions = accounts.map((account) => ({ value: account.id, label: account.name }))

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent
        title={rule ? t('recurring.form.editTitle') : t('recurring.form.newTitle')}
        description={t('recurring.form.lead')}
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
            <FormError>{problemMessage(mutation.error, t('recurring.form.failed'))}</FormError>
          )}

          {!rule && (
            <div
              role="radiogroup"
              aria-label={t('recurring.form.kind')}
              className="mb-1 flex gap-2"
            >
              {KINDS.map((kind) => (
                <Button
                  key={kind}
                  role="radio"
                  variant={form.kind === kind ? 'primary' : 'secondary'}
                  aria-checked={form.kind === kind}
                  onClick={() => {
                    set('kind', kind)
                    // A transfer has no category and nothing else has a destination.
                    set('categoryId', null)
                    set('toAccountId', '')
                  }}
                >
                  {t(`recurring.kinds.${kind}`)}
                </Button>
              ))}
            </div>
          )}

          <TextField
            label={t('recurring.form.name')}
            autoComplete="off"
            required
            autoFocus
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            hint={t('recurring.form.nameHint')}
          />

          <CurrencyInput
            label={t('recurring.form.amount')}
            value={form.amount}
            onChange={(value) => set('amount', value)}
            currency={currency}
            required
          />

          <div
            role="radiogroup"
            aria-label={t('recurring.form.amountMode')}
            className="mb-1 flex gap-2"
          >
            {(['fixed', 'estimated'] as const).map((mode) => (
              <Button
                key={mode}
                role="radio"
                variant={form.amountMode === mode ? 'primary' : 'secondary'}
                aria-checked={form.amountMode === mode}
                onClick={() => {
                  set('amountMode', mode)
                  // An estimate must never post itself: there would be nobody to catch the guess.
                  if (mode === 'estimated') set('autoPost', false)
                }}
              >
                {t(`recurring.amountModes.${mode}`)}
              </Button>
            ))}
          </div>

          <SelectField
            label={t(
              form.kind === 'income' ? 'recurring.form.intoAccount' : 'recurring.form.fromAccount',
            )}
            options={accountOptions}
            value={accountId}
            onChange={(event) => set('accountId', event.target.value)}
          />

          {needsDestination && (
            <SelectField
              label={t('recurring.form.toAccount')}
              options={[
                { value: '', label: t('recurring.form.chooseAccount') },
                ...accountOptions.filter((option) => option.value !== accountId),
              ]}
              value={form.toAccountId}
              onChange={(event) => set('toAccountId', event.target.value)}
              error={
                form.toAccountId === accountId && form.toAccountId
                  ? t('recurring.form.sameAccount')
                  : undefined
              }
            />
          )}

          {needsCategory && (
            <CategoryPicker
              label={t('recurring.form.category')}
              value={form.categoryId}
              onChange={(value) => set('categoryId', value)}
              required={onBudget}
              // Only money that has left the budget can be uncategorised (§10).
              allowNone={!onBudget}
            />
          )}

          {goals.length > 0 && (
            <SelectField
              label={t('recurring.form.goal')}
              options={[
                { value: '', label: t('recurring.form.noGoal') },
                ...goals.map((goal) => ({ value: goal.id, label: goal.name })),
              ]}
              value={form.goalId}
              onChange={(event) => set('goalId', event.target.value)}
              hint={t(
                form.kind === 'transfer'
                  ? 'recurring.form.goalEarmark'
                  : 'recurring.form.goalFunded',
              )}
            />
          )}

          <p className="mt-3 mb-0 text-label text-ink-2">{t('recurring.form.scheduleHeading')}</p>

          <div className="flex gap-3">
            <SelectField
              className="flex-1"
              label={t('recurring.form.freq')}
              options={FREQUENCIES.map((freq) => ({
                value: freq,
                label: t(`recurring.frequencies.${freq}`),
              }))}
              value={form.freq}
              onChange={(event) => {
                set('freq', event.target.value as RecurrenceFrequency)
                set('byMonthDay', '')
              }}
            />
            <TextField
              className="w-28"
              label={t('recurring.form.interval')}
              inputMode="numeric"
              value={form.interval}
              onChange={(event) => set('interval', event.target.value)}
              error={validInterval ? undefined : t('recurring.form.intervalInvalid')}
            />
          </div>

          <TextField
            label={t('recurring.form.startDate')}
            type="date"
            required
            value={form.startDate}
            onChange={(event) => set('startDate', event.target.value)}
          />

          {form.freq === 'monthly' && (
            <TextField
              label={t('recurring.form.byMonthDay')}
              inputMode="numeric"
              value={form.byMonthDay}
              onChange={(event) => set('byMonthDay', event.target.value)}
              hint={t('recurring.form.byMonthDayHint')}
            />
          )}

          <SelectField
            label={t('recurring.form.weekendPolicy')}
            options={WEEKEND_POLICIES.map((policy) => ({
              value: policy,
              label: t(`recurring.weekendPolicies.${policy}`),
            }))}
            value={form.weekendPolicy}
            onChange={(event) => set('weekendPolicy', event.target.value as WeekendPolicy)}
          />

          <TextField
            label={t('recurring.form.endDate')}
            type="date"
            value={form.endDate}
            onChange={(event) => set('endDate', event.target.value)}
            hint={t('recurring.form.endDateHint')}
          />

          {form.amountMode === 'fixed' && (
            <label className="mt-1 flex items-center gap-2 text-body text-ink-2">
              <input
                type="checkbox"
                checked={form.autoPost}
                onChange={(event) => set('autoPost', event.target.checked)}
                className="size-4 accent-[var(--m-accent)]"
              />
              {t('recurring.form.autoPost')}
            </label>
          )}
          {form.autoPost && <FormNotice>{t('recurring.form.autoPostHint')}</FormNotice>}

          {perMonth && (
            <FormNotice>
              {t('recurring.form.perMonth')} <MoneyText value={perMonth} fractionDigits="none" />
            </FormNotice>
          )}

          {rule && (
            <div
              role="radiogroup"
              aria-label={t('recurring.form.scope')}
              className="mt-3 flex flex-col gap-2"
            >
              <span className="text-label text-ink-2">{t('recurring.form.scope')}</span>
              <div className="flex gap-2">
                {(['all', 'future'] as const).map((value) => (
                  <Button
                    key={value}
                    role="radio"
                    variant={scope === value ? 'primary' : 'secondary'}
                    aria-checked={scope === value}
                    onClick={() => setScope(value)}
                  >
                    {t(`recurring.form.scopes.${value}`)}
                  </Button>
                ))}
              </div>
              <p className="m-0 text-caption text-ink-3">
                {t(`recurring.form.scopeHints.${scope}`)}
              </p>
            </div>
          )}

          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" loading={mutation.isPending} disabled={!ready}>
              {rule ? t('recurring.form.save') : t('recurring.form.create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
