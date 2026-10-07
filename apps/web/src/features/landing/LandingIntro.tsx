import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { prefersReducedMotion } from './useReveal'

/**
 * The 2.0 intro: the logo's two halves settle into balance, the wordmark slides up, the brand
 * gradient rises, and the whole panel clips away to the hero. 2.8s, click to skip.
 *
 * Skipped outright when the visitor prefers reduced motion.
 */
export function LandingIntro({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    if (prefersReducedMotion()) {
      onDone()
      return
    }
    const timers = [
      [60, 1],
      [620, 2],
      [1250, 3],
      [1850, 4],
    ].map(([delay, next]) => window.setTimeout(() => setPhase(next!), delay))
    const finish = window.setTimeout(onDone, 2850)
    return () => {
      for (const timer of timers) window.clearTimeout(timer)
      window.clearTimeout(finish)
    }
  }, [onDone])

  function skip() {
    setPhase(4)
    window.setTimeout(onDone, 300)
  }

  return (
    <div
      role="presentation"
      data-landing-intro
      aria-hidden
      onClick={skip}
      title={t('landing.skipIntro')}
      className="fixed inset-0 z-100 flex cursor-pointer items-center justify-center bg-canvas transition-[clip-path] duration-[950ms] ease-[cubic-bezier(.76,0,.24,1)]"
      style={{ clipPath: phase >= 4 ? 'inset(0 0 100% 0)' : 'inset(0 0 0 0)' }}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 transition-[height] duration-[750ms] ease-[cubic-bezier(.76,0,.24,1)] [background:var(--m-brand-gradient)]"
        style={{ height: phase >= 3 ? '100%' : '0%' }}
      />
      <div className="relative flex items-center gap-[18px]">
        <svg viewBox="0 0 176 186" className="block h-[55px] w-[52px] overflow-visible">
          <path
            d="M8 6 L68 51 L68 178 L8 136 Z"
            className="fill-logo-left stroke-logo-left transition-[transform,opacity] duration-1000 ease-mizan"
            strokeWidth="8"
            strokeLinejoin="round"
            style={{
              transform: phase >= 1 ? 'none' : 'translate(-26px, 18px) rotate(-12deg)',
              opacity: phase >= 1 ? 1 : 0,
              transformOrigin: 'center',
            }}
          />
          <path
            d="M168 6 L168 136 L112 178 L112 106 C112 96 100 92 100 82 L100 54 Z"
            className="fill-logo-right stroke-logo-right transition-[transform,opacity] duration-1000 ease-mizan"
            strokeWidth="8"
            strokeLinejoin="round"
            style={{
              transform: phase >= 1 ? 'none' : 'translate(26px, 18px) rotate(12deg)',
              opacity: phase >= 1 ? 1 : 0,
              transformOrigin: 'center',
            }}
          />
        </svg>
        <span className="overflow-hidden pb-1">
          <span
            className="block text-[46px] leading-none tracking-[-0.045em] transition-transform duration-[900ms] ease-mizan"
            style={{ transform: phase >= 2 ? 'none' : 'translateY(110%)' }}
          >
            {t('app.name')}
          </span>
        </span>
      </div>
    </div>
  )
}
