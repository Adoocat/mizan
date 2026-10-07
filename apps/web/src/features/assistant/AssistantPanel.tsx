import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LogoMark } from '../../components/layout/Logo'
import { Button } from '../../components/ui/Button'
import { cn } from '../../lib/cn'
import {
  ASSISTANT_LINES,
  ASSISTANT_QUESTIONS,
  type AssistantQuestion,
} from '../landing/landing-data'

/**
 * The assistant drawer from `design/new-design/Assistant.dc.html`: a floating panel beside the
 * content, answering only from the workspace's own data, with the working shown.
 *
 * The answers are the mockup's (ADR 0007). Nothing is sent anywhere; the real assistant is v1.1.
 */
export function AssistantPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [asked, setAsked] = useState<AssistantQuestion | null>(null)

  return (
    <aside
      aria-label={t('assistant.title')}
      className="hidden w-[392px] flex-none flex-col gap-5 overflow-y-auto rounded-modal bg-surface p-6 lg:flex"
    >
      <header className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="m-0 text-panel-title text-ink">{t('assistant.title')}</h2>
          <p className="m-0 text-caption text-ink-3">{t('assistant.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setAsked(null)}
          className="cursor-pointer border-0 bg-transparent p-0 text-caption text-accent hover:underline"
        >
          {t('assistant.newChat')}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="inline-flex size-8 flex-none cursor-pointer items-center justify-center rounded-full text-ink-3 hover:bg-inset hover:text-ink"
        >
          <svg aria-hidden viewBox="0 0 16 16" className="size-3.5">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" fill="none" />
          </svg>
        </button>
      </header>

      {asked === null ? (
        <>
          <p className="m-0 text-body text-ink-2">{t('assistant.intro')}</p>
          <span className="text-label text-ink-3">{t('assistant.suggested')}</span>
          <div className="flex flex-col gap-2.5">
            {ASSISTANT_QUESTIONS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setAsked(key)}
                className="cursor-pointer rounded-control border border-border-strong px-4 py-3 text-left text-body text-ink-2 transition-colors duration-150 ease-mizan hover:bg-inset hover:text-ink"
              >
                {t(`landing.assistant.${key}.question`)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="m-0 self-end rounded-inset bg-inset px-4 py-2.5 text-body text-ink">
            {t(`landing.assistant.${asked}.question`)}
          </p>
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-5 rounded-[5px]" />
            <span className="text-caption text-ink-3">{t('app.name')}</span>
          </div>
          <p className="m-0 text-value-s text-accent">{t(`landing.assistant.${asked}.verdict`)}</p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {Array.from({ length: ASSISTANT_LINES }, (_, index) => (
              <li key={index} className="flex gap-3 text-body text-ink-2">
                <span aria-hidden className="mt-2 size-1.5 flex-none rounded-full bg-accent" />
                {t(`landing.assistant.${asked}.lines.${index}`)}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-4">
            <span className="text-caption text-ink-3">
              {t(`landing.assistant.${asked}.source`)}
            </span>
            <span className="text-body font-medium text-accent">{t('landing.showWorking')}</span>
          </div>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2.5">
        <div
          className={cn(
            'flex h-10 items-center rounded-full border border-border-strong bg-inset px-4 text-body text-ink-3',
          )}
        >
          {t('assistant.placeholder')}
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="m-0 text-caption text-ink-3">{t('assistant.disclaimer')}</p>
          <Button size="sm" variant="primary">
            {t('assistant.ask')}
          </Button>
        </div>
      </div>
    </aside>
  )
}
