import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { isLanguage, storeLanguage, SUPPORTED_LANGUAGES } from '../../lib/i18n'
import { usePrivacy } from '../../lib/privacy'
import { THEME_PREFERENCES, useTheme } from '../../lib/theme'

interface SegmentedOption<T extends string> {
  value: T
  label: string
}

/** A small radio group styled as a segmented control (theme and language switches). */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex gap-0.5 rounded-control border border-border bg-canvas p-0.5"
    >
      {options.map((option) => {
        const checked = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex-1 cursor-pointer rounded-badge px-2 py-0.5 text-caption font-medium whitespace-nowrap',
              checked ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function ThemeSwitch() {
  const { t } = useTranslation()
  const { preference, setPreference } = useTheme()
  return (
    <Segmented
      label={t('theme.label')}
      value={preference}
      onChange={setPreference}
      options={THEME_PREFERENCES.map((value) => ({ value, label: t(`theme.${value}`) }))}
    />
  )
}

export function LanguageSwitch() {
  const { t, i18n } = useTranslation()
  const current = isLanguage(i18n.language) ? i18n.language : 'en'
  return (
    <Segmented
      label={t('language.label')}
      value={current}
      onChange={(language) => {
        storeLanguage(language)
        void i18n.changeLanguage(language)
      }}
      options={SUPPORTED_LANGUAGES.map((value) => ({ value, label: t(`language.${value}`) }))}
    />
  )
}

export function PrivacyToggle({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { hideAmounts, setHideAmounts } = usePrivacy()
  return (
    <button
      type="button"
      aria-pressed={hideAmounts}
      onClick={() => setHideAmounts(!hideAmounts)}
      className={cn(
        'inline-flex h-8 cursor-pointer items-center gap-2 rounded-control border border-border-strong bg-surface px-3 text-body text-ink hover:bg-canvas',
        className,
      )}
    >
      <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 text-ink-3">
        <path
          d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <circle cx="8" cy="8" r="2" fill="currentColor" />
        {hideAmounts && <path d="M2 14 14 2" stroke="currentColor" strokeWidth="1.3" />}
      </svg>
      {hideAmounts ? t('privacy.show') : t('privacy.hide')}
    </button>
  )
}
