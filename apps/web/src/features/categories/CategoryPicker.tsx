import { matchesSearch } from '@mizan/domain'
import { useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { useCategories } from './api'
import { useCategoryOptions, type CategoryOption } from './names'

/**
 * Chooses a category, with search that folds Turkish casing the way the API does: typing
 * `ogrenci` finds "Öğrenci", `MARKET` finds "Market" (`matchesSearch`, PLAN §7).
 *
 * It is a combo box rather than a `<select>` because the list is long, grouped and searchable,
 * and because quick add has to stay a keyboard-only flow: type a few letters, press Enter.
 */
export function CategoryPicker({
  label,
  value,
  onChange,
  required = false,
  error,
  allowNone = false,
  autoFocus = false,
  className,
}: {
  label: string
  value: string | null
  onChange: (categoryId: string | null) => void
  required?: boolean
  error?: string | undefined
  /** Lets the user pick "no category", for a transfer or an off-budget account. */
  allowNone?: boolean
  autoFocus?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const { data } = useCategories()
  const options = useCategoryOptions(data)

  const inputId = useId()
  const listId = `${inputId}-list`
  const messageId = `${inputId}-message`
  const inputRef = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const selected = options.find((option) => option.id === value)

  const matches = useMemo(() => {
    const live = options.filter((option) => !option.archived)
    if (!query.trim()) return live
    // Group name included, so "essentials" brings up every essential category.
    return live.filter(
      (option) => matchesSearch(option.label, query) || matchesSearch(option.groupLabel, query),
    )
  }, [options, query])

  function choose(option: CategoryOption | null) {
    onChange(option?.id ?? null)
    setQuery('')
    setOpen(false)
    setActive(0)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActive((index) => {
        const next = event.key === 'ArrowDown' ? index + 1 : index - 1
        if (matches.length === 0) return 0
        return (next + matches.length) % matches.length
      })
      return
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault()
      const option = matches[active]
      if (option) choose(option)
      return
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      setQuery('')
      setOpen(false)
    }
  }

  const text = open ? query : (selected?.label ?? '')

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-label text-ink-2">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? messageId : undefined}
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          required={required}
          value={text}
          placeholder={t('transactions.form.categoryPlaceholder')}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          // A blur that lands on an option must not close the list before the click lands.
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className={cn(
            'h-10 w-full min-w-0 rounded-control border bg-surface px-3.5 text-body text-ink outline-none transition-colors duration-150 ease-mizan placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            error ? 'border-negative' : 'border-border-strong hover:border-border-hover',
          )}
        />

        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className="absolute inset-x-0 top-11 z-50 m-0 max-h-64 list-none overflow-y-auto rounded-inset border border-border bg-surface p-1.5 shadow-overlay"
          >
            {allowNone && (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === null}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(null)}
                  className="flex w-full cursor-pointer items-center rounded-control px-3 py-2 text-left text-body text-ink-2 hover:bg-inset"
                >
                  {t('transactions.form.noCategory')}
                </button>
              </li>
            )}
            {matches.length === 0 ? (
              <li className="px-3 py-2 text-body text-ink-3">
                {t('transactions.form.noCategoryMatches')}
              </li>
            ) : (
              matches.map((option, index) => (
                <li key={option.id}>
                  <button
                    type="button"
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={option.id === value}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(option)}
                    onMouseEnter={() => setActive(index)}
                    className={cn(
                      'flex w-full cursor-pointer items-center justify-between gap-3 rounded-control px-3 py-2 text-left text-body hover:bg-inset',
                      option.depth === 1 && 'pl-7',
                      index === active ? 'bg-inset text-ink' : 'text-ink',
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    <span className="flex-none text-caption text-ink-3">{option.groupLabel}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      <p
        id={messageId}
        aria-live="polite"
        className={cn('m-0 min-h-4 text-caption', error ? 'text-negative' : 'text-ink-3')}
      >
        {error}
      </p>
    </div>
  )
}
