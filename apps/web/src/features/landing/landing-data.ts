/**
 * The landing page's figures, from `design/new-design/Mizan Landing.dc.html`.
 *
 * Marketing copy lives in the locale files; only numbers live here, as `Money` and `Decimal`.
 * The mockup computes these with JavaScript floats and `Math.round` — we don't.
 */
import { decimal, Money, type Decimal } from '@mizan/domain'

const tl = (amount: string) => Money.of(amount, 'TRY')

export interface FlowRow {
  key: 'essentials' | 'pool' | 'savings' | 'investments' | 'debt'
  amount: Money
  /** A CSS colour expression from the data palette. */
  color: string
}

/** Where October's ₺50,000 goes, as the Sankey ribbons of scene 01. */
export const FLOWS: FlowRow[] = [
  { key: 'essentials', amount: tl('22500'), color: 'var(--m-data-essentials)' },
  { key: 'pool', amount: tl('9000'), color: 'var(--m-data-pool)' },
  { key: 'savings', amount: tl('6000'), color: 'var(--m-data-savings)' },
  { key: 'investments', amount: tl('8000'), color: 'var(--m-data-investments)' },
  { key: 'debt', amount: tl('4500'), color: 'var(--m-data-debt)' },
]

export const MONTHLY_INCOME = tl('50000')

export interface LandingGoal {
  key: 'japan' | 'computer' | 'house'
  saved: Money
  target: Money
  tone: 'warning' | 'accent' | 'neutral'
}

export const LANDING_GOALS: LandingGoal[] = [
  { key: 'japan', saved: tl('24500'), target: tl('35000'), tone: 'warning' },
  { key: 'computer', saved: tl('27000'), target: tl('40000'), tone: 'accent' },
  { key: 'house', saved: tl('650000'), target: tl('1500000'), tone: 'neutral' },
]

/** Portfolio value, twelve months to October 2026. */
export const INVESTMENT_SERIES: Decimal[] = [
  '842000',
  '861500',
  '879000',
  '868200',
  '902400',
  '921800',
  '944100',
  '968900',
  '991500',
  '1012300',
  '1038700',
  '1060200',
].map(decimal)

export const PORTFOLIO = tl('1060200')
export const UNREALISED = decimal('0.16')
export const REAL_RETURN_12M = decimal('0.035')

export interface AllocationRow {
  key: 'equities' | 'funds' | 'gold' | 'eurobonds' | 'fx' | 'cash'
  share: Decimal
  color: string
}

export const ALLOCATION: AllocationRow[] = [
  { key: 'equities', share: decimal('0.418'), color: 'var(--m-data-investments)' },
  { key: 'funds', share: decimal('0.246'), color: 'var(--m-data-savings)' },
  { key: 'gold', share: decimal('0.194'), color: 'var(--m-data-pool)' },
  { key: 'eurobonds', share: decimal('0.082'), color: 'var(--m-data-essentials)' },
  { key: 'fx', share: decimal('0.037'), color: 'var(--m-data-debt)' },
  { key: 'cash', share: decimal('0.023'), color: 'var(--m-ink-3)' },
]

/** Net worth, twelve months to October 2026 (nominal lira). */
export const NET_WORTH_SERIES: Decimal[] = [
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
].map(decimal)

/** Twelve-month inflation, used to restate the series in today's lira. */
export const INFLATION_12M = decimal('0.269')

export const ASSETS = tl('2167950')
export const LIABILITIES = tl('-101200')
export const NET_WORTH = tl('2066750')
export const ASSET_ROWS = [
  { key: 'cash', amount: tl('465350'), color: 'var(--m-data-savings)' },
  { key: 'investments', amount: tl('1060200'), color: 'var(--m-data-investments)' },
  { key: 'other', amount: tl('642400'), color: 'var(--m-data-essentials)' },
] as const

/* What-if (scene 06): five years of compounding at a real 3.5% a year. */
export const WHAT_IF = {
  /** Starting net worth. */
  principal: decimal('2066750'),
  /** What the current plan already saves and invests each month. */
  baseContribution: decimal('14000'),
  /** The slider's range: nothing, up to the whole Available-to-spend line. */
  maxExtra: decimal('9000'),
  annualRealReturn: decimal('0.035'),
  /** Months between the points drawn across the five years: 21 points, a quarter apart. */
  monthStep: 3,
  samples: 21,
} as const

/** The projection's horizon: five years. */
export const WHAT_IF_MONTHS = WHAT_IF.monthStep * (WHAT_IF.samples - 1)

/**
 * Future value of a starting balance plus a monthly contribution:
 * `P(1+r)^n + c((1+r)^n − 1)/r`, with r the monthly real rate. All in Decimal.
 */
export function futureValue(contribution: Decimal, months: number): Decimal {
  const rate = WHAT_IF.annualRealReturn.dividedBy(12)
  const growth = rate.plus(1).pow(months)
  return WHAT_IF.principal.times(growth).plus(contribution.times(growth.minus(1)).dividedBy(rate))
}

export function moneyFromDecimal(value: Decimal): Money {
  return Money.of(value.toDecimalPlaces(2).toFixed(2), 'TRY')
}

/** The assistant's two questions; the text itself is translated. */
export const ASSISTANT_QUESTIONS = ['afford', 'invest'] as const
export type AssistantQuestion = (typeof ASSISTANT_QUESTIONS)[number]
/** How many working lines each answer has, so the reveal can stagger them. */
export const ASSISTANT_LINES = 3
