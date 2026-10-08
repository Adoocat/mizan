import type { CategoryDto, CategoryGroupDto, CategoryListResponse } from '@mizan/contracts'
import { http, HttpResponse } from 'msw'

let counter = 0
const id = (suffix: string) => `019a2c1e-0000-7000-8000-0000000c${suffix}`

/** The key a test looks a fixture category up by, which is not always its system key. */
const keys = new Map<string, CategoryDto>()

function category(key: string, groupId: string, overrides: Partial<CategoryDto> = {}): CategoryDto {
  counter += 1
  const built: CategoryDto = {
    id: id(String(1000 + counter)),
    groupId,
    parentId: null,
    name: key,
    systemKey: key,
    renamed: false,
    isEssential: false,
    sortOrder: counter,
    archivedAt: null,
    usageCount: 0,
    ...overrides,
  }
  keys.set(key, built)
  return built
}

const INCOME_GROUP = id('0001')
const ESSENTIALS_GROUP = id('0002')
const FLEXIBLE_GROUP = id('0003')

/** A trimmed-down version of the seeded template, enough for the pickers and the filters. */
export const TEST_CATEGORY_GROUPS: CategoryGroupDto[] = [
  {
    id: INCOME_GROUP,
    name: 'income',
    systemKey: 'income',
    renamed: false,
    kind: 'income',
    sortOrder: 1,
    categories: [category('salary', INCOME_GROUP)],
  },
  {
    id: ESSENTIALS_GROUP,
    name: 'essentials',
    systemKey: 'essentials',
    renamed: false,
    kind: 'essential',
    sortOrder: 2,
    categories: [
      category('groceries', ESSENTIALS_GROUP, { isEssential: true, usageCount: 12 }),
      category('transport', ESSENTIALS_GROUP, { isEssential: true }),
    ],
  },
  {
    id: FLEXIBLE_GROUP,
    name: 'flexible',
    systemKey: 'flexible',
    renamed: false,
    kind: 'flexible',
    sortOrder: 3,
    categories: [
      category('diningOut', FLEXIBLE_GROUP),
      // A category the user made themselves: no system key, so its stored name is what shows.
      category('personalCare', FLEXIBLE_GROUP, { name: 'Öğrenci indirimi', systemKey: null }),
    ],
  },
]

export const TEST_CATEGORY_LIST: CategoryListResponse = { groups: TEST_CATEGORY_GROUPS }

/** Looks a fixture category up by the key it was built with. */
export function testCategory(key: string): CategoryDto {
  const found = keys.get(key)
  if (!found) throw new Error(`No test category for ${key}`)
  return found
}

/** Read-only handler for the category endpoint. Tests that mutate add their own on top. */
export function categoryHandlers(list: CategoryListResponse = TEST_CATEGORY_LIST) {
  return [http.get('*/api/v1/categories', () => HttpResponse.json(list))]
}
