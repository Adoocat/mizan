import type { CategoryDto, CategoryGroupDto } from '@mizan/contracts'
import { compareCategoryGroupKinds } from '@mizan/domain'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardTitle } from '../../components/ui/Card'
import { Dialog, DialogContent } from '../../components/ui/Dialog'
import { FormError, SelectField, TextField } from '../../components/ui/Field'
import { Skeleton } from '../../components/ui/Skeleton'
import { ApiError } from '../../lib/api-client'
import { cn } from '../../lib/cn'
import {
  useCategories,
  useCreateCategory,
  useMergeCategory,
  useSetCategoryArchived,
  useUpdateCategory,
} from './api'
import { useCategoryGroupName, useCategoryName } from './names'

function problemMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? (error.detail ?? fallback) : fallback
}

/** Rename a category, or move it to another group. */
function EditCategoryDialog({
  category,
  groups,
  onClose,
}: {
  category: CategoryDto
  groups: CategoryGroupDto[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const categoryName = useCategoryName()
  const groupName = useCategoryGroupName()
  const update = useUpdateCategory(category.id)

  const [name, setName] = useState(categoryName(category))
  const [groupId, setGroupId] = useState(category.groupId)
  const [isEssential, setIsEssential] = useState(category.isEssential)

  const trimmed = name.trim()

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent title={t('categorySettings.editTitle')} variant="sheet">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (trimmed.length === 0) return
            update.mutate({ name: trimmed, groupId, isEssential }, { onSuccess: onClose })
          }}
          className="flex flex-col gap-1"
        >
          {update.error && (
            <FormError>{problemMessage(update.error, t('categorySettings.failed'))}</FormError>
          )}

          <TextField
            label={t('categorySettings.name')}
            value={name}
            autoFocus
            autoComplete="off"
            error={trimmed.length === 0 ? t('categorySettings.nameRequired') : undefined}
            onChange={(event) => setName(event.target.value)}
          />

          <SelectField
            label={t('categorySettings.group')}
            options={groups.map((group) => ({ value: group.id, label: groupName(group) }))}
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
          />

          <label className="flex items-center gap-2.5 py-2 text-body text-ink">
            <input
              type="checkbox"
              checked={isEssential}
              onChange={(event) => setIsEssential(event.target.checked)}
              className="size-3.5 accent-[var(--m-primary)]"
            />
            {t('categorySettings.essential')}
          </label>
          <p className="m-0 text-caption text-ink-3">{t('categorySettings.essentialHint')}</p>

          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" loading={update.isPending}>
              {t('settings.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Merge a duplicate into the category that should have been used all along. */
function MergeCategoryDialog({
  category,
  options,
  onClose,
}: {
  category: CategoryDto
  options: { id: string; label: string }[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const categoryName = useCategoryName()
  const merge = useMergeCategory(category.id)
  const [intoId, setIntoId] = useState(options[0]?.id ?? '')

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        title={t('categorySettings.mergeTitle', { name: categoryName(category) })}
        description={t('categorySettings.mergeLead', { count: category.usageCount })}
        variant="sheet"
      >
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (!intoId) return
            merge.mutate({ intoId }, { onSuccess: onClose })
          }}
          className="flex flex-col gap-1"
        >
          {merge.error && (
            <FormError>{problemMessage(merge.error, t('categorySettings.failed'))}</FormError>
          )}
          <SelectField
            label={t('categorySettings.mergeInto')}
            options={options.map((option) => ({ value: option.id, label: option.label }))}
            value={intoId}
            onChange={(event) => setIntoId(event.target.value)}
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" loading={merge.isPending} disabled={!intoId}>
              {t('categorySettings.merge')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CategoryRow({
  category,
  onEdit,
  onMerge,
}: {
  category: CategoryDto
  onEdit: () => void
  onMerge: () => void
}) {
  const { t } = useTranslation()
  const categoryName = useCategoryName()
  const setArchived = useSetCategoryArchived(category.id)
  const archived = category.archivedAt !== null

  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-control px-4 py-2.5 hover:bg-inset',
        archived && 'opacity-70',
      )}
    >
      <span
        className={cn('min-w-0 flex-1 truncate text-body text-ink', category.parentId && 'pl-5')}
      >
        {categoryName(category)}
      </span>

      {category.isEssential && <Badge tone="neutral">{t('categorySettings.essentialTag')}</Badge>}
      {archived && <Badge tone="neutral">{t('accounts.archived')}</Badge>}

      <span className="text-caption text-ink-3">
        {t('categorySettings.used', { count: category.usageCount })}
      </span>

      <span className="flex flex-none gap-1">
        <Button size="sm" variant="ghost" onClick={onEdit}>
          {t('categorySettings.edit')}
        </Button>
        {category.usageCount > 0 && !archived && (
          <Button size="sm" variant="ghost" onClick={onMerge}>
            {t('categorySettings.merge')}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          loading={setArchived.isPending}
          onClick={() => setArchived.mutate(!archived)}
        >
          {archived ? t('categorySettings.unarchive') : t('categorySettings.archive')}
        </Button>
      </span>
    </li>
  )
}

/**
 * Category management, in Settings (PLAN §13).
 *
 * Categories are archived rather than deleted and merged rather than renamed-over, because every
 * one of them may be referenced by transactions a closed period depends on (§7). The row says how
 * many lines use a category, which is what makes that choice obvious to the user.
 */
export function CategorySettings() {
  const { t } = useTranslation()
  const [showArchived, setShowArchived] = useState(false)
  const { data, isPending, error } = useCategories(showArchived)

  const categoryName = useCategoryName()
  const groupName = useCategoryGroupName()
  const create = useCreateCategory()

  const [editing, setEditing] = useState<CategoryDto | null>(null)
  const [merging, setMerging] = useState<CategoryDto | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  const groups = [...(data?.groups ?? [])].sort((a, b) => compareCategoryGroupKinds(a.kind, b.kind))
  const everyCategory = groups.flatMap((group) => group.categories)

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>{t('categorySettings.title')}</CardTitle>
        <Button
          variant="secondary"
          size="sm"
          aria-pressed={showArchived}
          onClick={() => setShowArchived((value) => !value)}
        >
          {showArchived ? t('accounts.hideArchived') : t('accounts.showArchived')}
        </Button>
      </div>
      <p className="m-0 max-w-[60ch] text-body text-ink-2">{t('categorySettings.lead')}</p>

      {error && <FormError>{t('categorySettings.loadFailed')}</FormError>}

      {isPending ? (
        <Skeleton className="h-48 w-full rounded-card" />
      ) : (
        groups.map((group) => (
          <section key={group.id} aria-label={groupName(group)} className="flex flex-col gap-1">
            <h3 className="m-0 px-4 text-label font-medium text-ink-2">{groupName(group)}</h3>
            <ul className="m-0 flex list-none flex-col p-0">
              {group.categories.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  onEdit={() => setEditing(category)}
                  onMerge={() => setMerging(category)}
                />
              ))}
            </ul>

            {adding === group.id ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!newName.trim()) return
                  create.mutate(
                    { groupId: group.id, name: newName.trim() },
                    {
                      onSuccess: () => {
                        setNewName('')
                        setAdding(null)
                      },
                    },
                  )
                }}
                className="flex items-end gap-2 px-4"
              >
                <TextField
                  label={t('categorySettings.newName')}
                  value={newName}
                  autoFocus
                  autoComplete="off"
                  className="flex-1"
                  onChange={(event) => setNewName(event.target.value)}
                />
                <Button type="submit" size="sm" variant="primary" loading={create.isPending}>
                  {t('categorySettings.add')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAdding(null)
                    setNewName('')
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </form>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="self-start"
                onClick={() => setAdding(group.id)}
              >
                {t('categorySettings.addTo', { group: groupName(group) })}
              </Button>
            )}
          </section>
        ))
      )}

      {editing && (
        <EditCategoryDialog category={editing} groups={groups} onClose={() => setEditing(null)} />
      )}
      {merging && (
        <MergeCategoryDialog
          category={merging}
          options={everyCategory
            .filter((one) => one.id !== merging.id && one.archivedAt === null)
            .map((one) => ({ id: one.id, label: categoryName(one) }))}
          onClose={() => setMerging(null)}
        />
      )}
    </Card>
  )
}
