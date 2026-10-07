import { decimal, formatMoney, type Decimal } from '@mizan/domain'
import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import { PercentText } from '../../components/finance/PercentText'
import { LogoMark } from '../../components/layout/Logo'
import { LanguageSwitch, ThemeSwitch } from '../../components/layout/Preferences'
import { cn } from '../../lib/cn'
import { useNumberLocale } from '../../lib/use-locale'
import { LandingIntro } from './LandingIntro'
import {
  ALLOCATION,
  ASSET_ROWS,
  ASSETS,
  ASSISTANT_LINES,
  ASSISTANT_QUESTIONS,
  FLOWS,
  futureValue,
  INFLATION_12M,
  INVESTMENT_SERIES,
  LANDING_GOALS,
  LIABILITIES,
  MONTHLY_INCOME,
  moneyFromDecimal,
  NET_WORTH,
  NET_WORTH_SERIES,
  PORTFOLIO,
  REAL_RETURN_12M,
  UNREALISED,
  WHAT_IF,
  type AssistantQuestion,
} from './landing-data'
import { useReveal } from './useReveal'
import { BalanceShapes, FlowLines, SankeyFlows, SeriesChart, ShareBar } from './visuals'

const SECTION = 'mx-auto w-full max-w-[1520px] px-[max(22px,6vw)]'

/** One masked line of a display heading: it slides up from behind its own edge. */
function MaskedLine({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  return (
    <span className="block overflow-hidden pb-[0.08em]">
      <span
        data-reveal="mask"
        data-reveal-delay={delay}
        className={cn('block transition-transform duration-[1300ms]', className)}
      >
        {children}
      </span>
    </span>
  )
}

function Eyebrow({ index, children }: { index: string; children: ReactNode }) {
  return (
    <span
      data-reveal="fade"
      className="flex items-center gap-3.5 font-mono text-eyebrow text-ink-3 uppercase"
    >
      {index}
      <span aria-hidden className="h-px w-10 bg-border-hover" />
      {children}
    </span>
  )
}

function SceneLead({ children }: { children: ReactNode }) {
  return (
    <p
      data-reveal="up"
      data-reveal-delay={200}
      className="m-0 max-w-[42ch] text-lead text-ink-2 transition-[opacity,transform] duration-700"
    >
      {children}
    </p>
  )
}

/**
 * The panels clip open rather than fade: a wipe from the bottom. The clip leaves the panel with
 * no visible area, which an IntersectionObserver reads as "not intersecting" — so the wrapper is
 * what gets watched, and it carries the layout classes.
 */
function ScenePanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-reveal-trigger className={cn('min-w-0', className)}>
      <div
        data-reveal="clip"
        className="flex h-full flex-col gap-8 rounded-frame bg-surface p-[clamp(24px,3.2vw,48px)] transition-[clip-path] duration-[1200ms]"
      >
        {children}
      </div>
    </div>
  )
}

/** A scene: the statement on one side, the product on the other, alternating down the page. */
function Scene({
  index,
  eyebrow,
  titleLines,
  body,
  children,
  flip = false,
}: {
  index: string
  eyebrow: string
  titleLines: [string, string]
  body: string
  children: ReactNode
  flip?: boolean
}) {
  return (
    <section
      className={cn(
        SECTION,
        'grid items-center gap-12 py-[clamp(60px,10vh,120px)] md:gap-[clamp(48px,6vw,110px)]',
        flip ? 'md:grid-cols-[1.35fr_1fr]' : 'md:grid-cols-[1fr_1.35fr]',
      )}
    >
      <div className={cn('flex min-w-0 max-w-[540px] flex-col gap-7', flip && 'md:order-2')}>
        <Eyebrow index={index}>{eyebrow}</Eyebrow>
        <h2 data-reveal-trigger className="m-0 text-display-l text-ink">
          <MaskedLine>{titleLines[0]}</MaskedLine>
          <MaskedLine delay={90}>{titleLines[1]}</MaskedLine>
        </h2>
        <SceneLead>{body}</SceneLead>
      </div>
      <div className={cn('min-w-0', flip && 'md:order-1')}>{children}</div>
    </section>
  )
}

function NetWorthScene() {
  const { t } = useTranslation()
  const locale = useNumberLocale()
  const [real, setReal] = useState(false)

  // Restating the past year in today's lira: each month is inflated forward to October.
  const realSeries = NET_WORTH_SERIES.map((value, index) =>
    value.times(INFLATION_12M.plus(1).pow((NET_WORTH_SERIES.length - 1 - index) / 11)),
  )
  const nominalGain = NET_WORTH_SERIES.at(-1)!.minus(NET_WORTH_SERIES[0]!)
  const realGain = NET_WORTH_SERIES.at(-1)!.minus(realSeries[0]!)
  const gain = (value: Decimal) =>
    formatMoney(moneyFromDecimal(value), locale, { fractionDigits: 'none' })

  return (
    <section
      className={cn(
        SECTION,
        'flex flex-col gap-[clamp(40px,6vh,72px)] py-[clamp(60px,10vh,120px)]',
      )}
    >
      <div className="flex flex-col gap-7">
        <Eyebrow index="05">{t('landing.scenes.netWorth.eyebrow')}</Eyebrow>
        <h2 data-reveal-trigger className="m-0 max-w-[16ch] text-display-l text-ink">
          <MaskedLine>{t('landing.scenes.netWorth.title1')}</MaskedLine>
          <MaskedLine delay={90}>{t('landing.scenes.netWorth.title2')}</MaskedLine>
        </h2>
        <SceneLead>{t('landing.scenes.netWorth.body')}</SceneLead>
      </div>

      <div className="flex flex-wrap gap-5">
        <ScenePanel className="flex-1 basis-[22rem]">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-label text-ink-3">{t('landing.assets')}</span>
            <span className="text-panel-value text-ink">
              <MoneyText value={ASSETS} fractionDigits="none" />
            </span>
          </div>
          <ShareBar
            label={t('landing.assets')}
            rows={ASSET_ROWS.map((row) => ({
              key: row.key,
              share: row.amount.amount.dividedBy(ASSETS.amount),
              color: row.color,
            }))}
          />
          <dl className="m-0 flex flex-col gap-2.5">
            {ASSET_ROWS.map((row) => (
              <div key={row.key} className="flex items-baseline justify-between gap-3 text-body">
                <dt className="flex items-center gap-2.5 text-ink-2">
                  <span
                    aria-hidden
                    className="size-2 rounded-[2px]"
                    style={{ background: row.color }}
                  />
                  {t(`landing.assetRows.${row.key}`)}
                </dt>
                <dd className="m-0 text-ink">
                  <MoneyText value={row.amount} fractionDigits="none" />
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex items-baseline justify-between gap-4 border-t border-divider pt-5">
            <span className="text-label text-ink-3">{t('landing.liabilities')}</span>
            <span className="text-value-s text-ink">
              <MoneyText value={LIABILITIES} fractionDigits="none" />
            </span>
          </div>
          <p className="m-0 text-caption text-ink-3">{t('landing.liabilityNote')}</p>
        </ScenePanel>

        <ScenePanel className="flex-[1.35] basis-[28rem]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="text-label text-ink-3">{t('landing.netWorthOn')}</span>
            <div
              role="radiogroup"
              aria-label={t('landing.netWorthBasis')}
              className="flex gap-0.5 rounded-full bg-inset p-1"
            >
              {[false, true].map((mode) => (
                <button
                  key={String(mode)}
                  type="button"
                  role="radio"
                  aria-checked={real === mode}
                  onClick={() => setReal(mode)}
                  className={cn(
                    'cursor-pointer rounded-full px-3.5 py-1 text-caption font-medium transition-colors duration-150 ease-mizan',
                    real === mode ? 'bg-surface text-ink' : 'text-ink-3 hover:text-ink',
                  )}
                >
                  {t(mode ? 'landing.realTerms' : 'landing.nominal')}
                </button>
              ))}
            </div>
          </div>
          <span className="text-display-figure text-ink">
            <MoneyText value={NET_WORTH} fractionDigits="none" />
          </span>
          <p className={cn('m-0 text-body', real ? 'text-warning' : 'text-accent')}>
            {real
              ? t('landing.netWorthRealNote', { gain: gain(realGain) })
              : t('landing.netWorthNominalNote', { gain: gain(nominalGain) })}
          </p>
          <SeriesChart
            values={real ? realSeries : NET_WORTH_SERIES}
            context={real ? NET_WORTH_SERIES : realSeries}
            label={t('landing.netWorthChart')}
            height={140}
          />
          <div className="flex justify-between gap-3 text-caption text-ink-3">
            <span>{t('landing.nov2025')}</span>
            <span className="text-center">
              {real ? t('landing.legendReal') : t('landing.legendNominal')}
            </span>
            <span>{t('landing.oct2026')}</span>
          </div>
        </ScenePanel>
      </div>
    </section>
  )
}

function WhatIfScene() {
  const { t } = useTranslation()
  const locale = useNumberLocale()
  const [extra, setExtra] = useState(() => decimal(5000))

  const project = (contribution: Decimal) =>
    Array.from({ length: WHAT_IF.samples }, (_, index) =>
      futureValue(contribution, index * WHAT_IF.monthStep),
    )

  const base = project(WHAT_IF.baseContribution)
  const boosted = project(WHAT_IF.baseContribution.plus(extra))
  const finalValue = boosted.at(-1)!
  const difference = finalValue.minus(base.at(-1)!)
  const poolLeft = WHAT_IF.maxExtra.minus(extra)

  return (
    <section
      id="features"
      className={cn(
        SECTION,
        'flex flex-col gap-[clamp(40px,6vh,72px)] py-[clamp(80px,12vh,140px)]',
      )}
    >
      <div className="flex flex-col gap-7">
        <Eyebrow index="06">{t('landing.scenes.whatIf.eyebrow')}</Eyebrow>
        <h2 data-reveal-trigger className="m-0 max-w-[22ch] text-display-l text-ink">
          {t('landing.whatIfQuestion')}{' '}
          <span className="text-accent">
            {formatMoney(moneyFromDecimal(extra), locale, { fractionDigits: 'none' })}
          </span>{' '}
          {t('landing.whatIfQuestionTail')}
        </h2>
      </div>

      <div className="flex flex-wrap gap-5">
        <div className="flex flex-1 basis-[22rem] flex-col gap-6">
          <label className="flex flex-col gap-3">
            <span className="text-label text-ink-3">{t('landing.extraEachMonth')}</span>
            <input
              type="range"
              min={0}
              max={WHAT_IF.maxExtra.toFixed(0)}
              step={250}
              value={extra.toFixed(0)}
              onChange={(event) => setExtra(decimal(event.target.value))}
              className="w-full accent-accent"
            />
          </label>
          <div className="flex justify-between gap-3 text-caption text-ink-3">
            <span>
              <MoneyText value={moneyFromDecimal(decimal(0))} fractionDigits="none" />
            </span>
            <span>{t('landing.allOfPool')}</span>
          </div>
          <p className="m-0 max-w-[42ch] text-lead text-ink-2">{t('landing.scenes.whatIf.body')}</p>
          <p className="m-0 text-body text-ink-2">
            {t('landing.poolBecomes')}{' '}
            <span className="font-medium text-ink">
              <MoneyText value={moneyFromDecimal(poolLeft)} fractionDigits="none" />
            </span>{' '}
            {t('landing.aMonth')}
            <span className="block text-caption text-ink-3">{t('landing.realTermsNote')}</span>
          </p>
        </div>

        <ScenePanel className="flex-[1.35] basis-[28rem]">
          <div className="flex flex-wrap gap-10">
            <div className="flex flex-col gap-1.5">
              <span className="text-label text-ink-3">{t('landing.netWorthBy')}</span>
              <span className="text-panel-value text-ink">
                <MoneyText value={moneyFromDecimal(finalValue)} fractionDigits="none" />
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-label text-ink-3">{t('landing.versusToday')}</span>
              <span className="text-panel-value text-positive">
                <MoneyText
                  value={moneyFromDecimal(difference)}
                  fractionDigits="none"
                  signDisplay="always"
                />
              </span>
            </div>
          </div>
          <SeriesChart
            values={boosted}
            context={base}
            label={t('landing.whatIfChart')}
            height={220}
          />
          <div className="flex justify-between gap-2 text-caption text-ink-3">
            {['2026', '2027', '2028', '2029', '2030', '2031'].map((year) => (
              <span key={year}>{year}</span>
            ))}
          </div>
        </ScenePanel>
      </div>
    </section>
  )
}

/**
 * The working, revealed one line at a time, as the assistant answers in the app. Mounted with
 * the question as its key, so picking another question starts the reveal again.
 */
function AnswerLines({ question }: { question: AssistantQuestion }) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(0)

  useEffect(() => {
    const timers = Array.from({ length: ASSISTANT_LINES }, (_, index) =>
      window.setTimeout(() => setShown(index + 1), 400 + index * 450),
    )
    return () => {
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [])

  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {Array.from({ length: ASSISTANT_LINES }, (_, index) => (
        <li
          key={index}
          className={cn(
            'flex gap-3 text-body text-ink-2 transition-opacity duration-500',
            index < shown ? 'opacity-100' : 'opacity-0',
          )}
        >
          <span aria-hidden className="mt-2 size-1.5 flex-none rounded-full bg-accent" />
          {t(`landing.assistant.${question}.lines.${index}`)}
        </li>
      ))}
    </ul>
  )
}

function AssistantScene() {
  const { t } = useTranslation()
  const [question, setQuestion] = useState<AssistantQuestion>('afford')

  return (
    <section
      className={cn(
        SECTION,
        'grid items-center gap-12 py-[clamp(40px,8vh,100px)] pb-[clamp(80px,14vh,160px)] md:grid-cols-[1fr_1.35fr] md:gap-[clamp(48px,6vw,110px)]',
      )}
    >
      <div className="flex min-w-0 max-w-[540px] flex-col gap-7">
        <Eyebrow index="07">{t('landing.scenes.assistant.eyebrow')}</Eyebrow>
        <h2 data-reveal-trigger className="m-0 text-display-l text-ink">
          <MaskedLine>{t('landing.scenes.assistant.title1')}</MaskedLine>
          <MaskedLine delay={90}>{t('landing.scenes.assistant.title2')}</MaskedLine>
        </h2>
        <SceneLead>{t('landing.scenes.assistant.body')}</SceneLead>
        <div className="flex flex-col gap-2.5">
          {ASSISTANT_QUESTIONS.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={question === key}
              onClick={() => setQuestion(key)}
              className={cn(
                'cursor-pointer rounded-control border px-4 py-3 text-left text-body transition-colors duration-150 ease-mizan',
                question === key
                  ? 'border-accent-strong bg-surface text-ink'
                  : 'border-border-strong text-ink-2 hover:bg-surface',
              )}
            >
              {t(`landing.assistant.${key}.question`)}
            </button>
          ))}
        </div>
      </div>

      <div className="min-w-0">
        <ScenePanel>
          <p className="m-0 text-panel-title text-ink">
            {t(`landing.assistant.${question}.question`)}
          </p>
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-5 rounded-[5px]" />
            <span className="text-caption text-ink-3">{t('app.name')}</span>
          </div>
          <p className="m-0 text-value-s text-accent">
            {t(`landing.assistant.${question}.verdict`)}
          </p>
          <AnswerLines key={question} question={question} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-5">
            <span className="text-caption text-ink-3">
              {t(`landing.assistant.${question}.source`)}
            </span>
            <span className="text-body font-medium text-accent">{t('landing.showWorking')}</span>
          </div>
        </ScenePanel>
      </div>
    </section>
  )
}

export function LandingPage() {
  const { t } = useTranslation()
  const [introDone, setIntroDone] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const reveal = useReveal<HTMLDivElement>()
  const finishIntro = useCallback(() => setIntroDone(true), [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div ref={reveal} className="min-h-dvh bg-canvas [overflow-x:clip]">
      {!introDone && <LandingIntro onDone={finishIntro} />}

      <nav
        aria-label={t('landing.nav')}
        className={cn(
          'fixed inset-x-3 top-3 z-40 flex h-18 items-center gap-8 rounded-modal px-[clamp(18px,3vw,36px)] transition-colors duration-500',
          scrolled && 'bg-canvas/75 backdrop-blur-xl',
        )}
      >
        <a href="#top" className="flex items-center gap-2.5 no-underline">
          <LogoMark />
          <span className="text-[20px] font-medium tracking-[-0.04em] text-ink">
            {t('app.name')}
          </span>
        </a>
        <div className="mx-auto hidden gap-7 md:flex">
          {['product', 'features', 'security', 'about'].map((key) => (
            <a
              key={key}
              href={`#${key}`}
              className="text-body text-ink-2 no-underline hover:text-ink"
            >
              {t(`landing.links.${key}`)}
            </a>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-5">
          <Link to="/" className="hidden text-body no-underline sm:block">
            {t('landing.signIn')}
          </Link>
          <Link
            to="/"
            className="flex h-[42px] items-center rounded-full bg-ink px-5 text-body font-medium whitespace-nowrap text-canvas no-underline hover:text-canvas hover:opacity-90"
          >
            {t('landing.cta')}
          </Link>
        </div>
      </nav>

      <main>
        <section id="top" className="p-3">
          <div className="relative isolate flex min-h-[clamp(640px,96vh,1000px)] flex-col justify-between overflow-hidden rounded-[36px] px-[clamp(22px,5vw,72px)] pt-[clamp(120px,16vh,170px)] pb-[clamp(28px,5vw,64px)]">
            <div
              aria-hidden
              className="absolute -inset-[12%] -z-10 [background:var(--m-brand-gradient)] motion-safe:animate-[mzDrift_26s_ease-in-out_infinite]"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute top-[8%] left-[2%] -z-10 h-[86%] opacity-80 [aspect-ratio:176/186] md:left-[6%]"
            >
              <div className="absolute inset-[6%] opacity-55 blur-[60px] [background:radial-gradient(closest-side,var(--m-shape-1-from),transparent)]" />
              <BalanceShapes className="absolute inset-0" />
            </div>
            <FlowLines />

            <div className="relative flex justify-end">
              <p className="m-0 max-w-[330px] text-body leading-relaxed text-ink-2 [text-wrap:pretty]">
                {t('landing.heroLead')}
              </p>
            </div>

            <div className="relative flex flex-col items-start gap-7">
              <h1 data-reveal-trigger className="m-0 text-display-xl text-ink">
                <MaskedLine>{t('landing.heroLine1')}</MaskedLine>
                <MaskedLine delay={120}>{t('landing.heroLine2')}</MaskedLine>
              </h1>
              <div className="flex flex-wrap items-center gap-5">
                <a href="#product" className="text-body text-ink-2 no-underline hover:text-ink">
                  {t('landing.seeHow')}
                </a>
                <Link
                  to="/"
                  className="flex h-14 items-center gap-4 rounded-full bg-ink pr-2 pl-6 text-[15px] font-medium text-canvas no-underline hover:text-canvas hover:opacity-90"
                >
                  {t('landing.cta')}
                  <span
                    aria-hidden
                    className="flex size-10 items-center justify-center rounded-full bg-accent text-[17px] text-canvas"
                  >
                    →
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section
          className={cn(SECTION, 'flex justify-center py-[clamp(110px,22vh,240px)]')}
          aria-label={t('landing.statementLabel')}
        >
          <h2
            data-reveal-trigger
            className="m-0 max-w-[1180px] text-center text-display-l leading-[1.04] text-ink [text-wrap:balance]"
          >
            <MaskedLine>{t('landing.statement1')}</MaskedLine>
            <MaskedLine delay={80}>{t('landing.statement2')}</MaskedLine>
            <MaskedLine delay={260} className="text-accent">
              {t('landing.statement3')}
            </MaskedLine>
            <MaskedLine delay={340} className="text-accent">
              {t('landing.statement4')}
            </MaskedLine>
          </h2>
        </section>

        <div id="product" />
        <Scene
          index="01"
          eyebrow={t('landing.scenes.plan.eyebrow')}
          titleLines={[t('landing.scenes.plan.title1'), t('landing.scenes.plan.title2')]}
          body={t('landing.scenes.plan.body')}
        >
          <ScenePanel>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-label text-ink-3">{t('landing.octoberIncome')}</span>
                <span className="text-[clamp(40px,4.4vw,64px)] leading-none font-light tracking-[-0.05em] text-ink">
                  <MoneyText value={MONTHLY_INCOME} fractionDigits="none" />
                </span>
              </div>
              <span className="flex items-center gap-2 text-body text-accent">
                <span aria-hidden className="size-1.5 rounded-full bg-accent" />
                {t('landing.everyLira')}
              </span>
            </div>
            <SankeyFlows label={t('landing.sankeyLabel')} />
            <dl className="m-0 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {FLOWS.map((flow) => (
                <div key={flow.key} className="flex items-baseline justify-between gap-3 text-body">
                  <dt className="flex items-center gap-2.5 text-ink-2">
                    <span
                      aria-hidden
                      className="size-2 rounded-[2px]"
                      style={{ background: flow.color }}
                    />
                    {t(`landing.flows.${flow.key}`)}
                  </dt>
                  <dd className="m-0 text-ink">
                    <MoneyText value={flow.amount} fractionDigits="none" />
                  </dd>
                </div>
              ))}
            </dl>
          </ScenePanel>
        </Scene>

        <Scene
          index="02"
          flip
          eyebrow={t('landing.scenes.transactions.eyebrow')}
          titleLines={[
            t('landing.scenes.transactions.title1'),
            t('landing.scenes.transactions.title2'),
          ]}
          body={t('landing.scenes.transactions.body')}
        >
          <ScenePanel>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-label text-ink-3">{t('landing.spentSoFar')}</span>
              <span className="text-panel-value text-ink">
                <MoneyText value={moneyFromDecimal(decimal('29329'))} fractionDigits="none" />
              </span>
            </div>
            <ShareBar
              label={t('landing.spentSoFar')}
              rows={[
                { key: 'essentials', share: decimal('0.574'), color: 'var(--m-data-essentials)' },
                { key: 'debt', share: decimal('0.153'), color: 'var(--m-data-debt)' },
                { key: 'flexible', share: decimal('0.273'), color: 'var(--m-data-flexible)' },
              ]}
            />
            <dl className="m-0 flex flex-col gap-3">
              {(
                [
                  ['essentials', '16840', 'var(--m-data-essentials)'],
                  ['debt', '4500', 'var(--m-data-debt)'],
                  ['flexible', '7989', 'var(--m-data-flexible)'],
                ] as const
              ).map(([key, amount, color]) => (
                <div key={key} className="flex items-baseline justify-between gap-3 text-body">
                  <dt className="flex items-center gap-2.5 text-ink-2">
                    <span
                      aria-hidden
                      className="size-2 rounded-[2px]"
                      style={{ background: color }}
                    />
                    {t(`landing.spendRows.${key}`)}
                  </dt>
                  <dd className="m-0 text-ink">
                    <MoneyText value={moneyFromDecimal(decimal(amount))} fractionDigits="none" />
                  </dd>
                </div>
              ))}
            </dl>
          </ScenePanel>
        </Scene>

        <Scene
          index="03"
          eyebrow={t('landing.scenes.savings.eyebrow')}
          titleLines={[t('landing.scenes.savings.title1'), t('landing.scenes.savings.title2')]}
          body={t('landing.scenes.savings.body')}
        >
          <ScenePanel>
            {LANDING_GOALS.map((goal) => (
              <div key={goal.key} className="flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between gap-3 text-body">
                  <span className="text-ink">{t(`goals.names.${goal.key}`)}</span>
                  <span className="text-ink-2">
                    <MoneyText value={goal.saved} fractionDigits="none" />
                    <span className="text-ink-3">
                      {' / '}
                      <MoneyText value={goal.target} fractionDigits="none" />
                    </span>
                  </span>
                </div>
                <div aria-hidden className="h-1.5 overflow-hidden rounded-bar bg-track">
                  <span
                    className={cn(
                      'block h-full rounded-bar',
                      goal.tone === 'warning'
                        ? 'bg-warning-bar'
                        : goal.tone === 'accent'
                          ? 'bg-accent-strong'
                          : 'bg-ink-3',
                    )}
                    style={{
                      width: `${goal.saved.amount.dividedBy(goal.target.amount).times(100).toFixed(1)}%`,
                    }}
                  />
                </div>
                <p
                  className={cn(
                    'm-0 text-caption',
                    goal.tone === 'warning'
                      ? 'text-warning'
                      : goal.tone === 'accent'
                        ? 'text-accent'
                        : 'text-ink-3',
                  )}
                >
                  {t(`goals.notes.${goal.key}`)}
                </p>
              </div>
            ))}
            <p className="m-0 border-t border-divider pt-5 text-caption text-ink-3">
              {t('landing.scheduled')}
            </p>
          </ScenePanel>
        </Scene>

        <Scene
          index="04"
          flip
          eyebrow={t('landing.scenes.investments.eyebrow')}
          titleLines={[
            t('landing.scenes.investments.title1'),
            t('landing.scenes.investments.title2'),
          ]}
          body={t('landing.scenes.investments.body')}
        >
          <ScenePanel>
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div className="flex flex-col gap-2">
                <span className="text-label text-ink-3">{t('landing.portfolio')}</span>
                <span className="text-panel-value text-ink">
                  <MoneyText value={PORTFOLIO} fractionDigits="none" />
                </span>
              </div>
              <div className="flex gap-8">
                <div className="flex flex-col gap-1.5">
                  <span className="text-label text-ink-3">{t('landing.unrealised')}</span>
                  <span className="text-value-s text-positive">
                    <PercentText value={UNREALISED} fractionDigits={1} signDisplay="always" />
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-label text-ink-3">{t('landing.real12')}</span>
                  <span className="text-value-s text-positive">
                    <PercentText value={REAL_RETURN_12M} fractionDigits={1} signDisplay="always" />
                  </span>
                </div>
              </div>
            </div>
            <SeriesChart
              values={INVESTMENT_SERIES}
              label={t('landing.portfolioChart')}
              height={160}
            />
            <ShareBar label={t('landing.allocation')} rows={ALLOCATION} />
            <dl className="m-0 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
              {ALLOCATION.map((row) => (
                <div key={row.key} className="flex items-baseline justify-between gap-3 text-body">
                  <dt className="flex items-center gap-2.5 text-ink-2">
                    <span
                      aria-hidden
                      className="size-2 rounded-[2px]"
                      style={{ background: row.color }}
                    />
                    {t(`landing.holdings.${row.key}`)}
                  </dt>
                  <dd className="m-0 text-ink">
                    <PercentText value={row.share} fractionDigits={1} />
                  </dd>
                </div>
              ))}
            </dl>
            <p className="m-0 border-t border-divider pt-5 text-caption text-ink-3">
              {t('landing.rebalance')}
            </p>
          </ScenePanel>
        </Scene>

        <NetWorthScene />
        <WhatIfScene />
        <AssistantScene />

        <section
          id="security"
          className={cn(
            SECTION,
            'flex flex-col gap-[clamp(40px,6vh,72px)] py-[clamp(60px,10vh,120px)]',
          )}
        >
          <h2 data-reveal-trigger className="m-0 max-w-[16ch] text-display-l text-ink">
            <MaskedLine>{t('landing.trustTitle1')}</MaskedLine>
            <MaskedLine delay={90}>{t('landing.trustTitle2')}</MaskedLine>
          </h2>
          <div className="grid gap-5 md:grid-cols-3">
            {(['readOnly', 'encrypted', 'yours'] as const).map((key, index) => (
              <article
                key={key}
                data-reveal="up"
                data-reveal-delay={index * 120}
                className="flex flex-col gap-3.5 rounded-card bg-surface p-7 transition-[opacity,transform] duration-700"
              >
                <span className="font-mono text-mono text-ink-3">{`0${index + 1}`}</span>
                <h3 data-reveal-trigger className="m-0 text-panel-title text-ink">
                  {t(`landing.trust.${key}.title`)}
                </h3>
                <p className="m-0 text-body text-ink-2">{t(`landing.trust.${key}.body`)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="p-3">
          <div className="relative isolate flex min-h-[70vh] flex-col items-start justify-center gap-10 overflow-hidden rounded-[36px] px-[clamp(22px,5vw,72px)] py-[clamp(80px,12vh,140px)]">
            <div
              aria-hidden
              className="absolute -inset-[12%] -z-10 [background:var(--m-brand-gradient)] motion-safe:animate-[mzDrift_26s_ease-in-out_infinite]"
            />
            <h2 data-reveal-trigger className="m-0 text-display-l text-ink">
              <MaskedLine>{t('landing.closingLine1')}</MaskedLine>
              <MaskedLine delay={90}>{t('landing.closingLine2')}</MaskedLine>
            </h2>
            <Link
              to="/"
              className="flex h-14 items-center gap-4 rounded-full bg-ink pr-2 pl-6 text-[15px] font-medium text-canvas no-underline hover:text-canvas hover:opacity-90"
            >
              {t('landing.cta')}
              <span
                aria-hidden
                className="flex size-10 items-center justify-center rounded-full bg-accent text-[17px] text-canvas"
              >
                →
              </span>
            </Link>
          </div>
        </section>
      </main>

      <footer id="about" className="border-t border-divider">
        <div className={cn(SECTION, 'flex flex-wrap gap-10 py-14')}>
          <div className="flex min-w-[16rem] flex-1 flex-col gap-3.5">
            <span className="flex items-center gap-2.5">
              <LogoMark />
              <span className="text-[19px] font-medium tracking-[-0.045em] text-ink">
                {t('app.name')}
              </span>
            </span>
            <p className="m-0 max-w-[36ch] text-body text-ink-2">{t('landing.footerBlurb')}</p>
            <p className="m-0 text-caption text-ink-3">{t('landing.sampleNote')}</p>
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-label text-ink-3">{t('landing.links.product')}</span>
            <Link to="/plan" className="text-body text-ink-2 no-underline hover:text-ink">
              {t('nav.plan')}
            </Link>
            <Link to="/goals" className="text-body text-ink-2 no-underline hover:text-ink">
              {t('nav.goals')}
            </Link>
            <Link to="/" className="text-body text-ink-2 no-underline hover:text-ink">
              {t('landing.signIn')}
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-label text-ink-3">{t('landing.preferences')}</span>
            <ThemeSwitch />
            <LanguageSwitch />
          </div>
        </div>
        <p className={cn(SECTION, 'm-0 pb-10 text-caption text-ink-3')}>{t('landing.copyright')}</p>
      </footer>
    </div>
  )
}
