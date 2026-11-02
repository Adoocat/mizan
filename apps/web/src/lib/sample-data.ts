/**
 * Placeholder data for the screens, taken from the mockups in `design/new-design/`.
 *
 * It exists so the pages can be built and reviewed before the API behind them does (phases 4–11).
 * Every page reads it through `useSampleData()`, so swapping in a TanStack Query hook later is a
 * one-line change per page. Amounts are `Money`, never numbers — the money rules apply to sample
 * data too, or the components would be built against the wrong types.
 *
 * The mockups are set on Thursday 22 October 2026, which is also the sample "today".
 */
import { decimal, Money, plainDate, type Decimal, type PlainDate } from '@mizan/domain'

const tl = (amount: string) => Money.of(amount, 'TRY')

/** The day the mockups depict. Real pages take the date from the injected clock. */
export const SAMPLE_TODAY: PlainDate = plainDate('2026-10-22')

export interface PlanGroup {
  key: 'plannedExpenses' | 'savings' | 'investments' | 'pool'
  amount: Money
  /** Tailwind background utility from the data palette. */
  colorClass: string
}

export interface AlertItem {
  id: string
  kind: 'overdue' | 'atRisk' | 'overBudget' | 'data'
  tone: 'negative' | 'warning' | 'accent'
}

export interface BudgetLine {
  id: string
  spent: Money
  limit: Money
  status: 'onPace' | 'aheadOfPace' | 'over'
}

export interface TransactionLine {
  id: string
  date: string
  merchant: string
  categoryKey: string | null
  account: string
  amount: Money
}

export interface CashFlowMonth {
  key: string
  income: Money
  spending: Money
}

const CASH_FLOW: CashFlowMonth[] = [
  { key: 'may', income: tl('48500'), spending: tl('38900') },
  { key: 'jun', income: tl('49000'), spending: tl('41200') },
  { key: 'jul', income: tl('52300'), spending: tl('44800') },
  { key: 'aug', income: tl('50000'), spending: tl('39600') },
  { key: 'sep', income: tl('50000'), spending: tl('37650') },
  { key: 'oct', income: tl('50000'), spending: tl('29329') },
]

const PLAN_GROUPS: PlanGroup[] = [
  { key: 'plannedExpenses', amount: tl('27000'), colorClass: 'bg-data-essentials' },
  { key: 'savings', amount: tl('6000'), colorClass: 'bg-data-savings' },
  { key: 'investments', amount: tl('8000'), colorClass: 'bg-data-investments' },
  { key: 'pool', amount: tl('9000'), colorClass: 'bg-data-pool' },
]

const ALERTS: AlertItem[] = [
  { id: 'water', kind: 'overdue', tone: 'negative' },
  { id: 'insurance', kind: 'atRisk', tone: 'warning' },
  { id: 'care', kind: 'overBudget', tone: 'warning' },
  { id: 'sync', kind: 'data', tone: 'accent' },
]

const BUDGETS: BudgetLine[] = [
  { id: 'groceries', spent: tl('4850'), limit: tl('6000'), status: 'aheadOfPace' },
  { id: 'transport', spent: tl('1420'), limit: tl('1800'), status: 'aheadOfPace' },
  { id: 'personalCare', spent: tl('610'), limit: tl('500'), status: 'over' },
  { id: 'utilities', spent: tl('1070'), limit: tl('1400'), status: 'onPace' },
  { id: 'pool', spent: tl('6000'), limit: tl('9000'), status: 'onPace' },
  { id: 'subscriptions', spent: tl('379'), limit: tl('700'), status: 'onPace' },
]

const TRANSACTIONS: TransactionLine[] = [
  {
    id: 't1',
    date: '22 Oct',
    merchant: 'Kahve Dünyası',
    categoryKey: 'diningOut',
    account: 'Garanti ··4471',
    amount: tl('-85'),
  },
  {
    id: 't2',
    date: '22 Oct',
    merchant: 'Migros Kadıköy',
    categoryKey: 'groceries',
    account: 'Bonus ··9020',
    amount: tl('-642.40'),
  },
  {
    id: 't3',
    date: '21 Oct',
    merchant: 'Yemeksepeti',
    categoryKey: 'diningOut',
    account: 'Bonus ··9020',
    amount: tl('-412.50'),
  },
  {
    id: 't4',
    date: '21 Oct',
    merchant: 'Shell Acıbadem',
    categoryKey: 'transport',
    account: 'Bonus ··9020',
    amount: tl('-920'),
  },
  {
    id: 't5',
    date: '20 Oct',
    merchant: 'Getir',
    categoryKey: null,
    account: 'Bonus ··9020',
    amount: tl('-318.75'),
  },
  {
    id: 't6',
    date: '20 Oct',
    merchant: 'Trendyol',
    categoryKey: 'shopping',
    account: 'Bonus ··9020',
    amount: tl('-1249.90'),
  },
  {
    id: 't7',
    date: '15 Oct',
    merchant: 'Atölye Studio — invoice #0412',
    categoryKey: 'income',
    account: 'Garanti ··4471',
    amount: tl('4000'),
  },
]

/** Everything the screens read. One object, so a later query hook can replace it wholesale. */
export interface SampleData {
  today: PlainDate
  lastSync: string
  hero: {
    availableThisMonth: Money
    spentSoFar: Money
    left: Money
    daysLeft: number
    perDay: Money
    spentToday: Money
    leftToday: Money
    spentTodayRatio: Decimal
  }
  plan: { groups: PlanGroup[]; elapsed: Decimal }
  glance: { checking: Money; spentThisMonth: Money; averageSpending: Money }
  alerts: AlertItem[]
  cashFlow: CashFlowMonth[]
  budgets: BudgetLine[]
  transactions: TransactionLine[]
}

export const SAMPLE_DATA: SampleData = {
  today: SAMPLE_TODAY,
  lastSync: '14:58',
  hero: {
    availableThisMonth: tl('9000'),
    spentSoFar: tl('6000'),
    left: tl('3000'),
    daysLeft: 10,
    perDay: tl('300'),
    spentToday: tl('85'),
    leftToday: tl('215'),
    spentTodayRatio: decimal('0.2833'),
  },
  plan: {
    groups: PLAN_GROUPS,
    // 71% of October has passed on the 22nd — the expected-pace marker.
    elapsed: decimal('0.71'),
  },
  glance: {
    checking: tl('24850'),
    spentThisMonth: tl('29329'),
    averageSpending: tl('40430'),
  },
  alerts: ALERTS,
  cashFlow: CASH_FLOW,
  budgets: BUDGETS,
  transactions: TRANSACTIONS,
}

/** The seam the API will replace: every page reads its data from here. */
export function useSampleData(): SampleData {
  return SAMPLE_DATA
}
