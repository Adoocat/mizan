import { DEFAULT_CATEGORY_TEMPLATE, isEssentialCategory } from '@mizan/domain'

/**
 * The names the default template is seeded with (PLAN §13).
 *
 * The *structure* of the template — which groups exist, their kinds and their order — is domain
 * data in `@mizan/domain`. The names live here because they are neither a financial rule nor the
 * string a user actually reads: the UI renders a seeded category from its `systemKey` through
 * i18next, so these are English fallbacks for exports, for the API's own responses and for
 * anyone reading the database. A user who renames one gets `name_overridden`, and their name
 * wins everywhere from then on.
 */
const NAMES: Record<string, string> = {
  // Groups
  income: 'Income',
  essentials: 'Essentials',
  flexible: 'Flexible spending',
  debt: 'Debt',
  savings: 'Savings',
  investments: 'Investments',
  // Income
  salary: 'Salary',
  freelance: 'Freelance',
  otherIncome: 'Other income',
  // Essentials
  rent: 'Rent',
  utilities: 'Utilities',
  internet: 'Internet',
  groceries: 'Food & groceries',
  transport: 'Transport',
  health: 'Health',
  insurance: 'Insurance',
  // Flexible
  diningOut: 'Dining out',
  shopping: 'Shopping',
  subscriptions: 'Subscriptions',
  personalCare: 'Personal care',
  entertainment: 'Entertainment',
  education: 'Education',
  gifts: 'Gifts & donations',
  other: 'Other',
  // Debt
  cardPayment: 'Card payment',
  loanPayment: 'Loan payment',
  // Savings and investments
  savingsTransfer: 'Transfer to savings',
  investmentContribution: 'Investment contribution',
}

export class MissingTemplateNameError extends Error {
  override name = 'MissingTemplateNameError'
}

export function templateName(systemKey: string): string {
  const name = NAMES[systemKey]
  if (!name) throw new MissingTemplateNameError(`No seed name for category key: ${systemKey}`)
  return name
}

export interface SeedGroup {
  systemKey: string
  name: string
  kind: string
  sortOrder: number
  categories: { systemKey: string; name: string; isEssential: boolean; sortOrder: number }[]
}

/** The rows to insert for a new workspace: the domain's structure with its names filled in. */
export function templateRows(): SeedGroup[] {
  return DEFAULT_CATEGORY_TEMPLATE.map((group) => ({
    systemKey: group.systemKey,
    name: templateName(group.systemKey),
    kind: group.kind,
    sortOrder: group.sortOrder,
    categories: group.categories.map((category) => ({
      systemKey: category.systemKey,
      name: templateName(category.systemKey),
      isEssential: isEssentialCategory(group.kind),
      sortOrder: category.sortOrder,
    })),
  }))
}
