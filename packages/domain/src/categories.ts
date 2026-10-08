/**
 * Categories: how spending is classified, and the template every workspace starts with
 * (PLAN §6, §10).
 *
 * A category belongs to a group, and the group's **kind** is what the plan reasons about: an
 * essential category behaves differently from a flexible one when a period closes, and the
 * emergency-fund target is built from the essential and debt lines (§9). Categories are two
 * levels deep at most — a category may have a parent, but a parent may not.
 *
 * Nothing here does I/O. The template is data: the API seeds it when a workspace is created, and
 * the UI renders a system category's name from its `systemKey` so it reads in both languages.
 */

/* --------------------------------------------------------------- group kinds */

/**
 * What a group of categories means to the plan (§6).
 *
 * - `income` — money arriving. Never allocated; it is what there is to allocate.
 * - `essential` — bills and necessities. Overspending here is the most serious kind.
 * - `flexible` — discretionary spending. Covered by the pool unless it has its own plan line.
 * - `debt` — repayments of money owed.
 * - `savings` — money set aside, usually towards a goal.
 * - `investment` — money moved into an investment account.
 */
export const CATEGORY_GROUP_KINDS = [
  'income',
  'essential',
  'flexible',
  'debt',
  'savings',
  'investment',
] as const

export type CategoryGroupKind = (typeof CATEGORY_GROUP_KINDS)[number]

export class UnknownCategoryGroupKindError extends Error {
  override name = 'UnknownCategoryGroupKindError'
}

export function isCategoryGroupKind(value: unknown): value is CategoryGroupKind {
  return typeof value === 'string' && (CATEGORY_GROUP_KINDS as readonly string[]).includes(value)
}

export function categoryGroupKind(value: string): CategoryGroupKind {
  if (!isCategoryGroupKind(value)) {
    throw new UnknownCategoryGroupKindError(`Unknown category group kind: ${value}`)
  }
  return value
}

/** Display order of the groups, matching how the Plan page stacks them (§13). */
const KIND_ORDER: Record<CategoryGroupKind, number> = {
  income: 0,
  essential: 1,
  flexible: 2,
  debt: 3,
  savings: 4,
  investment: 5,
}

export function compareCategoryGroupKinds(a: CategoryGroupKind, b: CategoryGroupKind): number {
  return KIND_ORDER[a] - KIND_ORDER[b]
}

/** Every kind but income: these are the groups money leaves through. */
export const isSpendingKind = (kind: CategoryGroupKind): boolean => kind !== 'income'

/**
 * Whether the pool covers this kind when the category has no plan line of its own (§10).
 *
 * Only flexible spending is pooled. An essential, debt, savings or investment category without a
 * line is simply unplanned, and phase 6 surfaces that rather than quietly absorbing it.
 */
export const isPooledByDefault = (kind: CategoryGroupKind): boolean => kind === 'flexible'

/** A category may have a parent, but a parent may not: two levels, no deeper (§6). */
export const MAX_CATEGORY_DEPTH = 2

/* ----------------------------------------------------------------- template */

export interface CategoryTemplateEntry {
  /** Stable identifier, unique per workspace. The UI translates it; the user may rename freely. */
  readonly systemKey: string
  readonly sortOrder: number
}

export interface CategoryTemplateGroup extends CategoryTemplateEntry {
  readonly kind: CategoryGroupKind
  readonly categories: readonly CategoryTemplateEntry[]
}

/**
 * The categories a new workspace starts with (§13: "default category template").
 *
 * Chosen for a household in Türkiye: rent and utilities rather than a mortgage, card and loan
 * repayment as their own group because *taksit* and consumer loans are everywhere, and a single
 * savings and investment category so the transfer out of an on-budget account always has
 * somewhere to land (§10). It is deliberately short — a list nobody can face editing is worse
 * than one with a few gaps, and adding a category takes seconds.
 *
 * `isEssential` is not stored per entry: it follows from the kind (see `isEssentialCategory`), so
 * the two can never disagree. A user who marks their own category essential overrides it.
 */
export const DEFAULT_CATEGORY_TEMPLATE: readonly CategoryTemplateGroup[] = [
  {
    systemKey: 'income',
    kind: 'income',
    sortOrder: 1,
    categories: [
      { systemKey: 'salary', sortOrder: 1 },
      { systemKey: 'freelance', sortOrder: 2 },
      { systemKey: 'otherIncome', sortOrder: 3 },
    ],
  },
  {
    systemKey: 'essentials',
    kind: 'essential',
    sortOrder: 2,
    categories: [
      { systemKey: 'rent', sortOrder: 1 },
      { systemKey: 'utilities', sortOrder: 2 },
      { systemKey: 'internet', sortOrder: 3 },
      { systemKey: 'groceries', sortOrder: 4 },
      { systemKey: 'transport', sortOrder: 5 },
      { systemKey: 'health', sortOrder: 6 },
      { systemKey: 'insurance', sortOrder: 7 },
    ],
  },
  {
    systemKey: 'flexible',
    kind: 'flexible',
    sortOrder: 3,
    categories: [
      { systemKey: 'diningOut', sortOrder: 1 },
      { systemKey: 'shopping', sortOrder: 2 },
      { systemKey: 'subscriptions', sortOrder: 3 },
      { systemKey: 'personalCare', sortOrder: 4 },
      { systemKey: 'entertainment', sortOrder: 5 },
      { systemKey: 'education', sortOrder: 6 },
      { systemKey: 'gifts', sortOrder: 7 },
      { systemKey: 'other', sortOrder: 8 },
    ],
  },
  {
    systemKey: 'debt',
    kind: 'debt',
    sortOrder: 4,
    categories: [
      { systemKey: 'cardPayment', sortOrder: 1 },
      { systemKey: 'loanPayment', sortOrder: 2 },
    ],
  },
  {
    systemKey: 'savings',
    kind: 'savings',
    sortOrder: 5,
    categories: [{ systemKey: 'savingsTransfer', sortOrder: 1 }],
  },
  {
    systemKey: 'investments',
    kind: 'investment',
    sortOrder: 6,
    categories: [{ systemKey: 'investmentContribution', sortOrder: 1 }],
  },
]

/** Whether a category in this group counts towards essential monthly expenses (§9). */
export const isEssentialCategory = (kind: CategoryGroupKind): boolean => kind === 'essential'

/** Every system key in the template, groups and categories together. Must be unique. */
export function categoryTemplateSystemKeys(): string[] {
  return DEFAULT_CATEGORY_TEMPLATE.flatMap((group) => [
    group.systemKey,
    ...group.categories.map((category) => category.systemKey),
  ])
}
