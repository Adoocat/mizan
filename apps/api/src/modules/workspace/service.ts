import type { MeResponse, UpdateMeInput, UpdateWorkspaceSettingsInput } from '@mizan/contracts'
import type { Db } from '../../db/client.ts'
import type { RequestAuth } from '../../plugins/auth.ts'
import { badRequest, forbidden, notFound } from '../../plugins/errors.ts'
import { countAccounts } from '../accounts/repository.ts'
import {
  findMembership,
  updateUser,
  updateWorkspace,
  type MembershipRow,
  type UserRow,
} from './repository.ts'

/** Only an owner or editor may change stored data; a viewer can read (PLAN §15). */
const WRITERS = new Set(['owner', 'editor'])

export function assertCanWrite(auth: RequestAuth) {
  if (!WRITERS.has(auth.role)) throw forbidden('Your role is read-only in this workspace.')
}

function toMeResponse(user: UserRow, workspace: MembershipRow): MeResponse {
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      // The column is constrained to the supported languages, so the cast is safe.
      locale: user.locale as MeResponse['user']['locale'],
      timezone: user.timezone,
    },
    workspace: {
      id: workspace.id,
      name: workspace.name,
      baseCurrency: workspace.baseCurrency as MeResponse['workspace']['baseCurrency'],
      periodStartDay: workspace.periodStartDay,
      timezone: workspace.timezone,
      role: workspace.role,
    },
  }
}

export function readMe(auth: RequestAuth): MeResponse {
  return toMeResponse(
    {
      id: auth.userId,
      name: auth.name,
      email: auth.email,
      emailVerified: auth.emailVerified,
      locale: auth.locale,
      timezone: auth.timezone,
    },
    auth.workspace,
  )
}

export async function patchMe(
  db: Db,
  auth: RequestAuth,
  input: UpdateMeInput,
): Promise<MeResponse> {
  const user = await updateUser(db, auth.userId, input)
  if (!user) throw notFound('Your account no longer exists.')
  return toMeResponse(user, auth.workspace)
}

export async function patchWorkspaceSettings(
  db: Db,
  auth: RequestAuth,
  input: UpdateWorkspaceSettingsInput,
): Promise<MeResponse> {
  assertCanWrite(auth)

  /*
   * The base currency denominates every account balance and every frozen `base_amount` on a
   * transaction line, so changing it once money is recorded would silently restate history. It is
   * therefore only editable while the workspace has no accounts (PLAN §7, decision D7).
   */
  if (
    input.baseCurrency !== undefined &&
    input.baseCurrency !== auth.workspace.baseCurrency &&
    (await countAccounts(db, auth.workspaceId)) > 0
  ) {
    throw badRequest('The base currency can only change while the workspace has no accounts.')
  }

  const updated = await updateWorkspace(db, auth.workspaceId, input)
  if (!updated) throw notFound('This workspace no longer exists.')

  // Re-read through the membership so the response always carries the caller's role.
  const membership = await findMembership(db, auth.workspaceId, auth.userId)
  if (!membership) throw forbidden('You are no longer a member of this workspace.')

  return toMeResponse(
    {
      id: auth.userId,
      name: auth.name,
      email: auth.email,
      emailVerified: auth.emailVerified,
      locale: auth.locale,
      timezone: auth.timezone,
    },
    membership,
  )
}
