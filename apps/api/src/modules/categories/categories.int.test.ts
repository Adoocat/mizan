import type { CategoryDto, CategoryListResponse, MergeCategoryResponse } from '@mizan/contracts'
import { DEFAULT_CATEGORY_TEMPLATE, categoryTemplateSystemKeys } from '@mizan/domain'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../db/client.ts'
import { buildTestApp, type TestApp } from '../../testing/app.ts'
import { connectTestDatabase } from '../../testing/postgres.ts'
import { signUpActor, type Actor } from '../../testing/session.ts'

let database: Database
let harness: TestApp
let actor: Actor

beforeAll(async () => {
  database = connectTestDatabase()
  harness = await buildTestApp(database)
  actor = await signUpActor(harness.app)
})

afterAll(async () => {
  await harness?.close()
  await database?.close()
})

const list = async (query = ''): Promise<CategoryListResponse> => {
  const response = await actor.request({ method: 'GET', url: `/api/v1/categories${query}` })
  expect(response.statusCode, response.body).toBe(200)
  return response.json<CategoryListResponse>()
}

/** A fresh group per test, so tests never fight over the seeded ones. */
async function newGroup(name: string, kind = 'flexible'): Promise<string> {
  const response = await actor.request({
    method: 'POST',
    url: '/api/v1/category-groups',
    payload: { name, kind },
  })
  expect(response.statusCode, response.body).toBe(201)
  return response.json<{ id: string }>().id
}

async function newCategory(
  groupId: string,
  name: string,
  extra: object = {},
): Promise<CategoryDto> {
  const response = await actor.request({
    method: 'POST',
    url: '/api/v1/categories',
    payload: { groupId, name, ...extra },
  })
  expect(response.statusCode, response.body).toBe(201)
  return response.json<CategoryDto>()
}

describe('the default template', () => {
  it('is seeded when the workspace is created', async () => {
    const { groups } = await list()

    expect(groups.map((group) => group.kind)).toEqual(
      DEFAULT_CATEGORY_TEMPLATE.map((group) => group.kind),
    )
    const keys = [
      ...groups.map((group) => group.systemKey),
      ...groups.flatMap((group) => group.categories.map((category) => category.systemKey)),
    ]
    expect(new Set(keys)).toEqual(new Set(categoryTemplateSystemKeys()))
  })

  it('marks the essentials group essential and nothing else', async () => {
    const { groups } = await list()
    for (const group of groups) {
      for (const category of group.categories) {
        expect(category.isEssential, `${group.kind}/${category.systemKey}`).toBe(
          group.kind === 'essential',
        )
      }
    }
  })

  it('gives a seeded category a system key and no override', async () => {
    const { groups } = await list()
    const groceries = groups
      .flatMap((group) => group.categories)
      .find((category) => category.systemKey === 'groceries')

    expect(groceries?.renamed).toBe(false)
    expect(groceries?.usageCount).toBe(0)
  })

  it('keeps each workspace to its own copy', async () => {
    const other = await signUpActor(harness.app)
    const mine = await list()
    const theirs = (
      await other.request({ method: 'GET', url: '/api/v1/categories' })
    ).json<CategoryListResponse>()

    const ids = new Set(mine.groups.map((group) => group.id))
    for (const group of theirs.groups) expect(ids.has(group.id)).toBe(false)
  })
})

describe('creating and editing', () => {
  it('creates a category at the end of its group', async () => {
    const groupId = await newGroup('Hobbies')
    const first = await newCategory(groupId, 'Climbing')
    const second = await newCategory(groupId, 'Pottery')

    expect(second.sortOrder).toBeGreaterThan(first.sortOrder)
  })

  it('answers a repeated client id with the category that already exists', async () => {
    const groupId = await newGroup('Idempotent')
    const id = crypto.randomUUID()

    const first = await actor.request({
      method: 'POST',
      url: '/api/v1/categories',
      payload: { id, groupId, name: 'Only once' },
    })
    const again = await actor.request({
      method: 'POST',
      url: '/api/v1/categories',
      payload: { id, groupId, name: 'Only once' },
    })

    expect(first.statusCode).toBe(201)
    expect(again.statusCode).toBe(200)
    expect(again.json<CategoryDto>().id).toBe(id)
  })

  it('takes the essential flag from the group unless told otherwise', async () => {
    const essentials = await newGroup('Bills', 'essential')
    const flexible = await newGroup('Fun', 'flexible')

    expect((await newCategory(essentials, 'Water')).isEssential).toBe(true)
    expect((await newCategory(flexible, 'Cinema')).isEssential).toBe(false)
    expect((await newCategory(flexible, 'Childcare', { isEssential: true })).isEssential).toBe(true)
  })

  it('records that a seeded category was renamed, so the stored name wins', async () => {
    const { groups } = await list()
    const seeded = groups
      .flatMap((group) => group.categories)
      .find((category) => category.systemKey === 'diningOut')

    const response = await actor.request({
      method: 'PATCH',
      url: `/api/v1/categories/${seeded?.id}`,
      payload: { name: 'Kahve & yemek' },
    })

    expect(response.statusCode, response.body).toBe(200)
    const updated = response.json<CategoryDto>()
    expect(updated.name).toBe('Kahve & yemek')
    expect(updated.renamed).toBe(true)
    // The key stays: the plan still knows which category this is.
    expect(updated.systemKey).toBe('diningOut')
  })

  it('refuses a blank name', async () => {
    const groupId = await newGroup('Validation')
    const response = await actor.request({
      method: 'POST',
      url: '/api/v1/categories',
      payload: { groupId, name: '   ' },
    })
    expect(response.statusCode).toBe(400)
  })
})

describe('subcategories', () => {
  it('nests one level', async () => {
    const groupId = await newGroup('Transport two levels')
    const parent = await newCategory(groupId, 'Transport')
    const child = await newCategory(groupId, 'Taxi', { parentId: parent.id })

    expect(child.parentId).toBe(parent.id)
  })

  it('refuses a third level', async () => {
    const groupId = await newGroup('Three levels')
    const parent = await newCategory(groupId, 'Parent')
    const child = await newCategory(groupId, 'Child', { parentId: parent.id })

    const response = await actor.request({
      method: 'POST',
      url: '/api/v1/categories',
      payload: { groupId, name: 'Grandchild', parentId: child.id },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json<{ detail: string }>().detail).toContain('two levels')
  })

  it('refuses a parent from another group', async () => {
    const one = await newGroup('Group one')
    const two = await newGroup('Group two')
    const parent = await newCategory(one, 'Parent')

    const response = await actor.request({
      method: 'POST',
      url: '/api/v1/categories',
      payload: { groupId: two, name: 'Child', parentId: parent.id },
    })
    expect(response.statusCode).toBe(400)
  })
})

describe('archiving', () => {
  it('hides a category from the list but keeps it findable', async () => {
    const groupId = await newGroup('Archive me')
    const category = await newCategory(groupId, 'Old habit')

    const archived = await actor.request({
      method: 'POST',
      url: `/api/v1/categories/${category.id}/archive`,
    })
    expect(archived.statusCode, archived.body).toBe(200)
    expect(archived.json<CategoryDto>().archivedAt).not.toBeNull()

    const visible = await list()
    const ids = visible.groups.flatMap((group) => group.categories.map((one) => one.id))
    expect(ids).not.toContain(category.id)

    const withArchived = await list('?includeArchived=true')
    const allIds = withArchived.groups.flatMap((group) => group.categories.map((one) => one.id))
    expect(allIds).toContain(category.id)
  })

  it('takes subcategories with the parent and brings them back together', async () => {
    const groupId = await newGroup('Family')
    const parent = await newCategory(groupId, 'Parent')
    const child = await newCategory(groupId, 'Child', { parentId: parent.id })

    await actor.request({ method: 'POST', url: `/api/v1/categories/${parent.id}/archive` })
    const archived = await list('?includeArchived=true')
    const archivedChild = archived.groups
      .flatMap((group) => group.categories)
      .find((one) => one.id === child.id)
    expect(archivedChild?.archivedAt).not.toBeNull()

    await actor.request({ method: 'POST', url: `/api/v1/categories/${parent.id}/unarchive` })
    const restored = await list()
    const ids = restored.groups.flatMap((group) => group.categories.map((one) => one.id))
    expect(ids).toContain(child.id)
  })

  it('refuses to archive twice', async () => {
    const groupId = await newGroup('Twice')
    const category = await newCategory(groupId, 'Once only')

    await actor.request({ method: 'POST', url: `/api/v1/categories/${category.id}/archive` })
    const again = await actor.request({
      method: 'POST',
      url: `/api/v1/categories/${category.id}/archive`,
    })
    expect(again.statusCode).toBe(409)
  })

  it('refuses to restore a child while its parent is archived', async () => {
    const groupId = await newGroup('Orphan')
    const parent = await newCategory(groupId, 'Parent')
    const child = await newCategory(groupId, 'Child', { parentId: parent.id })

    await actor.request({ method: 'POST', url: `/api/v1/categories/${parent.id}/archive` })
    const response = await actor.request({
      method: 'POST',
      url: `/api/v1/categories/${child.id}/unarchive`,
    })
    expect(response.statusCode).toBe(409)
  })
})

describe('merging', () => {
  it('moves the lines across and archives the source', async () => {
    const account = await actor.request({
      method: 'POST',
      url: '/api/v1/accounts',
      payload: {
        name: 'Merge test account',
        type: 'checking',
        openingBalance: { amount: '5000.00', currency: 'TRY' },
      },
    })
    const accountId = account.json<{ id: string }>().id

    const groupId = await newGroup('Duplicates')
    const duplicate = await newCategory(groupId, 'Coffe')
    const keeper = await newCategory(groupId, 'Coffee')

    for (const amount of ['60.00', '45.00']) {
      const spend = await actor.request({
        method: 'POST',
        url: '/api/v1/transactions',
        payload: {
          type: 'expense',
          date: '2026-10-22',
          accountId,
          parts: [{ categoryId: duplicate.id, amount: { amount, currency: 'TRY' } }],
        },
      })
      expect(spend.statusCode, spend.body).toBe(201)
    }

    const response = await actor.request({
      method: 'POST',
      url: `/api/v1/categories/${duplicate.id}/merge`,
      payload: { intoId: keeper.id },
    })
    expect(response.statusCode, response.body).toBe(200)

    const merged = response.json<MergeCategoryResponse>()
    expect(merged.movedLines).toBe(2)
    expect(merged.into.id).toBe(keeper.id)
    expect(merged.into.usageCount).toBe(2)

    // The duplicate is archived, not deleted: nothing that referenced it is lost.
    const withArchived = await list('?includeArchived=true')
    const source = withArchived.groups
      .flatMap((group) => group.categories)
      .find((one) => one.id === duplicate.id)
    expect(source?.archivedAt).not.toBeNull()
  })

  it('refuses to merge a category into itself', async () => {
    const groupId = await newGroup('Self merge')
    const category = await newCategory(groupId, 'Alone')

    const response = await actor.request({
      method: 'POST',
      url: `/api/v1/categories/${category.id}/merge`,
      payload: { intoId: category.id },
    })
    expect(response.statusCode).toBe(400)
  })

  it('refuses to merge a parent that still has subcategories', async () => {
    const groupId = await newGroup('Parent merge')
    const parent = await newCategory(groupId, 'Parent')
    await newCategory(groupId, 'Child', { parentId: parent.id })
    const target = await newCategory(groupId, 'Target')

    const response = await actor.request({
      method: 'POST',
      url: `/api/v1/categories/${parent.id}/merge`,
      payload: { intoId: target.id },
    })
    expect(response.statusCode).toBe(409)
  })
})

describe('reordering', () => {
  it('puts the categories in the order the ids arrive', async () => {
    const groupId = await newGroup('Reorder')
    const a = await newCategory(groupId, 'Aaa')
    const b = await newCategory(groupId, 'Bbb')
    const c = await newCategory(groupId, 'Ccc')

    const response = await actor.request({
      method: 'POST',
      url: '/api/v1/categories/reorder',
      payload: { ids: [c.id, a.id, b.id] },
    })
    expect(response.statusCode, response.body).toBe(200)

    const group = response.json<CategoryListResponse>().groups.find((one) => one.id === groupId)
    expect(group?.categories.map((one) => one.name)).toEqual(['Ccc', 'Aaa', 'Bbb'])
  })

  it('refuses the whole reorder when one id is not ours', async () => {
    const other = await signUpActor(harness.app)
    const theirs = (
      await other.request({ method: 'GET', url: '/api/v1/categories' })
    ).json<CategoryListResponse>()
    const foreign = theirs.groups.flatMap((group) => group.categories)[0]!

    const groupId = await newGroup('Partial reorder')
    const mine = await newCategory(groupId, 'Mine')

    const response = await actor.request({
      method: 'POST',
      url: '/api/v1/categories/reorder',
      payload: { ids: [foreign.id, mine.id] },
    })
    expect(response.statusCode).toBe(404)
  })
})
