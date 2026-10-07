import { DEFAULT_CURRENCY, DEFAULT_PERIOD_START_DAY, DEFAULT_TIME_ZONE } from '@mizan/domain'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { users, workspaceMembers, workspaces } from '../../db/schema/index.ts'
import { uuidv7 } from '../../lib/uuid.ts'

export type WorkspaceRole = 'owner' | 'editor' | 'viewer'

export interface WorkspaceRow {
  id: string
  name: string
  baseCurrency: string
  periodStartDay: number
  timezone: string
}

export interface MembershipRow extends WorkspaceRow {
  role: WorkspaceRole
}

/** The name of the single workspace every account starts with ("Personal ▾" in the mockups). */
export const PERSONAL_WORKSPACE_NAME = 'Personal'

const workspaceColumns = {
  id: workspaces.id,
  name: workspaces.name,
  baseCurrency: workspaces.baseCurrency,
  periodStartDay: workspaces.periodStartDay,
  timezone: workspaces.timezone,
} as const

/**
 * Creates the user's personal workspace and makes them its owner, in one transaction so a
 * half-provisioned account can never exist (decision D6, ADR 0008).
 */
export async function createPersonalWorkspace(db: Db, userId: string): Promise<WorkspaceRow> {
  return db.transaction(async (tx) => {
    const [workspace] = await tx
      .insert(workspaces)
      .values({
        id: uuidv7(),
        name: PERSONAL_WORKSPACE_NAME,
        baseCurrency: DEFAULT_CURRENCY,
        periodStartDay: DEFAULT_PERIOD_START_DAY,
        timezone: DEFAULT_TIME_ZONE,
      })
      .returning(workspaceColumns)
    if (!workspace) throw new Error('Workspace insert returned no row')

    await tx.insert(workspaceMembers).values({ workspaceId: workspace.id, userId, role: 'owner' })
    return workspace
  })
}

/**
 * The workspace a user acts in. The MVP has exactly one per user, so the oldest membership wins;
 * a workspace switcher would pass the id explicitly instead.
 */
export async function findMembershipForUser(
  db: Db,
  userId: string,
): Promise<MembershipRow | undefined> {
  const [row] = await db
    .select({ ...workspaceColumns, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(workspaceMembers.createdAt, workspaces.id)
    .limit(1)
  return row ? { ...row, role: row.role as WorkspaceRole } : undefined
}

export async function findMembership(
  db: Db,
  workspaceId: string,
  userId: string,
): Promise<MembershipRow | undefined> {
  const [row] = await db
    .select({ ...workspaceColumns, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1)
  return row ? { ...row, role: row.role as WorkspaceRole } : undefined
}

export interface WorkspaceSettingsPatch {
  name?: string
  baseCurrency?: string
  periodStartDay?: number
  timezone?: string
}

export async function updateWorkspace(
  db: Db,
  workspaceId: string,
  patch: WorkspaceSettingsPatch,
): Promise<WorkspaceRow | undefined> {
  const [row] = await db
    .update(workspaces)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId))
    .returning(workspaceColumns)
  return row
}

export interface UserRow {
  id: string
  name: string
  email: string
  emailVerified: boolean
  locale: string
  timezone: string
}

const userColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  emailVerified: users.emailVerified,
  locale: users.locale,
  timezone: users.timezone,
} as const

export async function findUserById(db: Db, userId: string): Promise<UserRow | undefined> {
  const [row] = await db.select(userColumns).from(users).where(eq(users.id, userId)).limit(1)
  return row
}

export async function updateUser(
  db: Db,
  userId: string,
  patch: { name?: string; locale?: string; timezone?: string },
): Promise<UserRow | undefined> {
  const [row] = await db
    .update(users)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning(userColumns)
  return row
}
