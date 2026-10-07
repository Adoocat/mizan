/**
 * Placeholder data for the wealth and review screens, from `design/new-design/`.
 * Same rules as `sample-data.ts`: Money and Decimal, never numbers, and a phase replaces it.
 */
import { Decimal, decimal, Money } from '@mizan/domain'

const tl = (amount: string) => Money.of(amount, 'TRY')
const series = (values: string[]) => values.map(decimal)

/** The twelve months to October 2026, as the charts label them. */
export const MONTH_KEYS = [
  'nov',
  'dec',
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
] as const

/* ── Savings ─────────────────────────────────────────────────────────────── */

export interface SavingsGoal {
  id: 'emergency' | 'japan' | 'computer' | 'house'
  saved: Money
  target: Money
  monthly: Money
  status: 'onTrack' | 'behind' | 'neutral'
}

export const SAVINGS = {
  total: tl('440500'),
  monthly: tl('6000'),
  monthlyShare: decimal('0.12'),
  interest2026: tl('38920'),
  savingsRate: decimal('0.274'),
  emergency: {
    saved: tl('82000'),
    target: tl('150000'),
    monthlyExpenses: tl('24800'),
    months: decimal('3.3'),
    oneMonth: tl('24800'),
    threeMonths: tl('74400'),
    sixMonths: tl('148800'),
    toGo: tl('66800'),
  },
  essentials: [
    { key: 'rent', amount: tl('9500') },
    { key: 'groceries', amount: tl('6000') },
    { key: 'debtPayments', amount: tl('5500') },
    { key: 'transport', amount: tl('1800') },
    { key: 'utilities', amount: tl('1400') },
    { key: 'internet', amount: tl('600') },
  ],
  goals: [
    { id: 'japan', saved: tl('24500'), target: tl('35000'), monthly: tl('1500'), status: 'behind' },
    {
      id: 'computer',
      saved: tl('27000'),
      target: tl('40000'),
      monthly: tl('2000'),
      status: 'onTrack',
    },
    {
      id: 'house',
      saved: tl('650000'),
      target: tl('1500000'),
      monthly: tl('2500'),
      status: 'neutral',
    },
  ] satisfies SavingsGoal[],
  sinkingFunds: {
    saved: tl('7000'),
    needed: tl('25800'),
    funds: [
      { key: 'insurance', needed: tl('15000'), saved: tl('3000'), due: 'mar2027' },
      { key: 'tax', needed: tl('6800'), saved: tl('2600'), due: 'feb2027' },
      { key: 'school', needed: tl('4000'), saved: tl('1400'), due: 'sep2027' },
    ],
  },
}

/* ── Investments ─────────────────────────────────────────────────────────── */

export interface AssetClass {
  id: 'stocks' | 'funds' | 'gold' | 'eurobonds' | 'fx' | 'cash'
  value: Money
  target: Decimal
  color: string
}

export const INVESTMENTS = {
  value: tl('1060200'),
  invested: tl('913870'),
  unrealised: tl('146330'),
  unrealisedShare: decimal('0.16'),
  return12m: decimal('0.314'),
  realReturn: decimal('0.035'),
  monthly: tl('8000'),
  monthlyShare: decimal('0.16'),
  uninvestedCash: tl('24600'),
  /** Market value, twelve months to October. */
  marketValue: series([
    '838000',
    '851200',
    '879400',
    '872100',
    '901300',
    '925800',
    '941200',
    '968400',
    '989100',
    '1012600',
    '1041900',
    '1060200',
  ]),
  /** Net invested over the same months — the gap is what the market added. */
  netInvested: series([
    '770000',
    '778000',
    '786000',
    '794000',
    '802000',
    '818000',
    '834000',
    '850000',
    '866000',
    '882000',
    '898000',
    '913870',
  ]),
  classes: [
    {
      id: 'stocks',
      value: tl('443164'),
      target: decimal('0.30'),
      color: 'var(--m-data-investments)',
    },
    { id: 'funds', value: tl('260809'), target: decimal('0.30'), color: 'var(--m-data-savings)' },
    { id: 'gold', value: tl('205679'), target: decimal('0.20'), color: 'var(--m-data-pool)' },
    {
      id: 'eurobonds',
      value: tl('86936'),
      target: decimal('0.10'),
      color: 'var(--m-data-essentials)',
    },
    { id: 'fx', value: tl('39227'), target: decimal('0.05'), color: 'var(--m-data-debt)' },
    { id: 'cash', value: tl('24385'), target: decimal('0.05'), color: 'var(--m-ink-3)' },
  ] satisfies AssetClass[],
  /** Selling this much from stocks would restore the targets. */
  rebalanceAmount: tl('125000'),
  rebalanceMonths: 11,
}

/* ── Debts ───────────────────────────────────────────────────────────────── */

export interface DebtLine {
  id: 'personal' | 'student' | 'card'
  original: Money
  remaining: Money
  rate: Decimal
  monthly: Money
  nextDate: string
  payoff: string
}

export const DEBTS = {
  total: tl('101200'),
  loans: tl('82800'),
  card: tl('18400'),
  monthlyPayments: tl('5500'),
  shareOfIncome: decimal('0.11'),
  interest2026: tl('21960'),
  loanFreeBy: 'sep2028',
  lines: [
    {
      id: 'personal',
      original: tl('120000'),
      remaining: tl('68400'),
      rate: decimal('0.3708'),
      monthly: tl('4200'),
      nextDate: '5 Nov',
      payoff: 'sep2028',
    },
    {
      id: 'student',
      original: tl('36000'),
      remaining: tl('14400'),
      rate: decimal('0'),
      monthly: tl('1300'),
      nextDate: '15 Nov',
      payoff: 'jan2028',
    },
    {
      id: 'card',
      original: tl('18400'),
      remaining: tl('18400'),
      rate: decimal('0'),
      monthly: tl('18400'),
      nextDate: '25 Oct',
      payoff: 'monthly',
    },
  ] satisfies DebtLine[],
  /** The simulator's range, applied to the loans only. */
  maxExtra: decimal('6000'),
}

/** Months saved and interest avoided by paying `extra` more each month (avalanche order). */
export function debtPayoff(extra: Decimal) {
  // A simple amortisation over the two loans, highest rate first. All in Decimal.
  const loans = [
    {
      balance: decimal('68400'),
      monthlyRate: decimal('0.3708').dividedBy(12),
      payment: decimal('4200'),
    },
    { balance: decimal('14400'), monthlyRate: decimal('0'), payment: decimal('1300') },
  ]
  const run = (additional: Decimal) => {
    const state = loans.map((loan) => ({ ...loan }))
    let months = 0
    let interest = decimal(0)
    let freed = decimal(0)
    while (state.some((loan) => loan.balance.isPositive()) && months < 600) {
      months += 1
      let spare = additional.plus(freed)
      for (const loan of state) {
        if (!loan.balance.isPositive()) continue
        const charge = loan.balance.times(loan.monthlyRate)
        interest = interest.plus(charge)
        const payment = Decimal.min(loan.balance.plus(charge), loan.payment.plus(spare))
        spare = spare.minus(Decimal.max(0, payment.minus(loan.payment)))
        loan.balance = loan.balance.plus(charge).minus(payment)
        if (!loan.balance.isPositive()) freed = freed.plus(loan.payment)
      }
    }
    return { months, interest }
  }
  const base = run(decimal(0))
  const boosted = run(extra)
  return {
    months: boosted.months,
    monthsSaved: base.months - boosted.months,
    interest: boosted.interest,
    interestSaved: base.interest.minus(boosted.interest),
    baseMonths: base.months,
    baseInterest: base.interest,
  }
}

/* ── Net worth ───────────────────────────────────────────────────────────── */

export const NET_WORTH = {
  total: tl('2066750'),
  assets: tl('2167950'),
  liabilities: tl('101200'),
  sinceLastMonth: tl('38400'),
  sinceLastMonthShare: decimal('0.019'),
  liquid: tl('1426750'),
  debtToAssets: decimal('0.047'),
  contributions: tl('14000'),
  markets: tl('18700'),
  debtRepaid: tl('5700'),
  series: series([
    '1612000',
    '1648500',
    '1701200',
    '1688400',
    '1742900',
    '1781300',
    '1820600',
    '1866000',
    '1915400',
    '1972800',
    '2028350',
    '2066750',
  ]),
  liabilitySeries: series([
    '152000',
    '147400',
    '143100',
    '140600',
    '134900',
    '130200',
    '125800',
    '121300',
    '116700',
    '112400',
    '106900',
    '101200',
  ]),
  assetRows: [
    { key: 'cash', value: tl('27250'), change: tl('-9850') },
    { key: 'savings', value: tl('440500'), change: tl('8100') },
    { key: 'investments', value: tl('1060200'), change: tl('26750') },
    { key: 'vehicles', value: tl('640000'), change: tl('0') },
  ],
  liabilityRows: [
    { key: 'loans', value: tl('82800'), change: tl('-5500') },
    { key: 'cards', value: tl('18400'), change: tl('2100') },
  ],
}

/* ── Reports ─────────────────────────────────────────────────────────────── */

export const REPORTS = {
  score: 78,
  scoreBand: 'good' as const,
  scoreChange: 4,
  health: [
    { key: 'emergency', score: 13 },
    { key: 'savingsRate', score: 19 },
    { key: 'debtBurden', score: 17 },
    { key: 'budgetConsistency', score: 14 },
    { key: 'allocation', score: 15 },
  ],
  averageIncome: tl('49967'),
  averageSpending: tl('38946'),
  averageSavingsRate: decimal('0.221'),
  income: series([
    '48500',
    '49000',
    '52300',
    '50000',
    '50000',
    '48500',
    '49000',
    '52300',
    '50000',
    '50000',
    '50000',
    '50000',
  ]),
  spending: series([
    '38900',
    '41200',
    '44800',
    '39600',
    '37650',
    '38900',
    '41200',
    '44800',
    '39600',
    '37650',
    '38230',
    '29329',
  ]),
  categories: [
    { key: 'rent', amount: tl('9500'), average: tl('9500') },
    { key: 'groceries', amount: tl('5850'), average: tl('5620') },
    { key: 'debtPayments', amount: tl('5500'), average: tl('5500') },
    { key: 'diningOut', amount: tl('3420'), average: tl('2960') },
    { key: 'shopping', amount: tl('2640'), average: tl('3100') },
    { key: 'transport', amount: tl('1980'), average: tl('1760') },
    { key: 'utilities', amount: tl('1690'), average: tl('1540') },
    { key: 'subscriptions', amount: tl('1380'), average: tl('1399') },
    { key: 'health', amount: tl('1240'), average: tl('860') },
    { key: 'other', amount: tl('4450'), average: tl('4310') },
  ],
}

/* ── What-if simulator ───────────────────────────────────────────────────── */

export const WHAT_IF_PRESETS = ['car', 'move', 'sabbatical', 'course'] as const
export type WhatIfPreset = (typeof WHAT_IF_PRESETS)[number]

export const WHAT_IF_SIM = {
  defaultAmount: decimal('45000'),
  min: decimal('2500'),
  max: decimal('100000'),
  checkingMinimum: tl('5000'),
  /** Month-end cash cushion without the purchase: checking plus the emergency fund. */
  baseCushion: series([
    '106850',
    '112300',
    '118900',
    '124100',
    '131600',
    '138200',
    '145400',
    '152100',
    '159800',
    '166200',
    '173900',
    '181500',
  ]),
}

/** The cushion after spending `amount`, recovering at the plan's monthly surplus. */
export function cushionWith(amount: Decimal): Decimal[] {
  const recovery = decimal('6600')
  return WHAT_IF_SIM.baseCushion.map((value, index) =>
    Decimal.max(0, value.minus(Decimal.max(0, amount.minus(recovery.times(index))))),
  )
}
