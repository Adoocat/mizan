import { decimal, Decimal, type Money } from '@mizan/domain'
import { useId } from 'react'
import { seriesPoints, smoothPath, type Point } from '../../lib/smooth-path'
import { FLOWS, MONTHLY_INCOME } from './landing-data'

/**
 * The Mizan mark at hero scale: two balance plates with their own gradients and a sheen, swaying
 * together while each plate bobs against the other — they never settle at the same moment, which
 * is the point of the mark.
 */
export function BalanceShapes({ className }: { className?: string }) {
  const left = useId()
  const right = useId()
  const sheen = useId()
  return (
    <svg
      viewBox="-20 -20 216 226"
      aria-hidden
      className={`h-full w-full overflow-visible origin-[50%_90%] motion-safe:animate-[mzSway_11s_ease-in-out_infinite] ${className ?? ''}`}
    >
      <defs>
        <linearGradient id={left} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="var(--m-shape-1-from)" />
          <stop offset="1" stopColor="var(--m-shape-1-to)" />
        </linearGradient>
        <linearGradient id={right} x1="1" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="var(--m-shape-2-from)" />
          <stop offset="1" stopColor="var(--m-shape-2-to)" />
        </linearGradient>
        <linearGradient id={sheen} x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0" stopColor="var(--m-sheen)" />
          <stop offset="0.55" stopColor="transparent" />
        </linearGradient>
      </defs>
      <g className="motion-safe:animate-[mzBobA_9s_ease-in-out_infinite]">
        <path
          d="M8 6 L68 51 L68 178 L8 136 Z"
          fill={`url(#${left})`}
          stroke={`url(#${left})`}
          strokeWidth="8"
          strokeLinejoin="round"
          opacity="0.94"
        />
        <path d="M8 6 L68 51 L68 178 L8 136 Z" fill={`url(#${sheen})`} />
      </g>
      <g className="motion-safe:animate-[mzBobB_9s_ease-in-out_infinite]">
        <path
          d="M168 6 L168 136 L112 178 L112 106 C112 96 100 92 100 82 L100 54 Z"
          fill={`url(#${right})`}
          stroke={`url(#${right})`}
          strokeWidth="8"
          strokeLinejoin="round"
          opacity="0.94"
        />
        <path
          d="M168 6 L168 136 L112 178 L112 106 C112 96 100 92 100 82 L100 54 Z"
          fill={`url(#${sheen})`}
        />
      </g>
    </svg>
  )
}

/** The dotted currents drifting across the hero. */
export function FlowLines() {
  const lines = [
    { d: 'M-50 180 C250 120 420 300 700 210 C920 140 1100 260 1260 190', duration: '26s' },
    { d: 'M-50 330 C220 260 460 420 760 330 C980 265 1120 360 1260 320', duration: '32s' },
    { d: 'M-50 470 C260 400 440 560 740 470 C960 405 1130 500 1260 450', duration: '29s' },
    { d: 'M-50 600 C240 540 480 660 780 590 C1000 535 1140 610 1260 570', duration: '35s' },
  ]
  return (
    <svg
      viewBox="0 0 1200 700"
      preserveAspectRatio="none"
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {lines.map((line) => (
        <path
          key={line.d}
          d={line.d}
          fill="none"
          stroke="var(--m-flow)"
          strokeWidth="1"
          strokeDasharray="2 10"
          className="motion-safe:animate-[mzFlow_linear_infinite]"
          style={{ animationDuration: line.duration }}
        />
      ))}
    </svg>
  )
}

const SANKEY_WIDTH = decimal(606)
const SANKEY_HEIGHT = decimal(300)
const SOURCE_X = decimal(12)
const TARGET_X = decimal(594)
const MIDDLE = decimal(300)
const GAP = decimal(10)

interface Ribbon {
  key: string
  d: string
  color: string
}

/** Builds the ribbons outside the component: a fold, so nothing is reassigned during render. */
function sankeyRibbons(): Ribbon[] {
  const total = FLOWS.reduce((sum, flow) => sum.plus(flow.amount.amount), decimal(0))
  const sourceScale = SANKEY_HEIGHT.dividedBy(total)
  const targetScale = SANKEY_HEIGHT.minus(GAP.times(FLOWS.length - 1)).dividedBy(total)

  return FLOWS.reduce<{ ribbons: Ribbon[]; sourceY: Decimal; targetY: Decimal }>(
    (state, flow) => {
      const s0 = state.sourceY
      const t0 = state.targetY
      const s1 = s0.plus(flow.amount.amount.times(sourceScale))
      const t1 = t0.plus(flow.amount.amount.times(targetScale))
      const d =
        `M${SOURCE_X.toFixed(1)} ${s0.toFixed(1)}` +
        ` C${MIDDLE.toFixed(1)} ${s0.toFixed(1)} ${MIDDLE.toFixed(1)} ${t0.toFixed(1)} ${TARGET_X.toFixed(1)} ${t0.toFixed(1)}` +
        ` L${TARGET_X.toFixed(1)} ${t1.toFixed(1)}` +
        ` C${MIDDLE.toFixed(1)} ${t1.toFixed(1)} ${MIDDLE.toFixed(1)} ${s1.toFixed(1)} ${SOURCE_X.toFixed(1)} ${s1.toFixed(1)} Z`
      return {
        ribbons: [...state.ribbons, { key: flow.key, d, color: flow.color }],
        sourceY: s1,
        targetY: t1.plus(GAP),
      }
    },
    { ribbons: [], sourceY: decimal(0), targetY: decimal(0) },
  ).ribbons
}

const RIBBONS = sankeyRibbons()

/**
 * Income on the left, its five destinations on the right, each ribbon as thick as its share —
 * the plan, drawn. Thicknesses come straight from the amounts, in Decimal.
 */
export function SankeyFlows({ label }: { label: string }) {
  return (
    <svg
      viewBox={`0 0 ${SANKEY_WIDTH.toFixed(0)} ${SANKEY_HEIGHT.toFixed(0)}`}
      role="img"
      aria-label={label}
      className="block h-auto w-full"
    >
      {RIBBONS.map((ribbon, index) => (
        <path
          key={ribbon.key}
          d={ribbon.d}
          fill={ribbon.color}
          opacity="0.85"
          data-reveal="fade"
          data-reveal-delay={200 + index * 90}
        />
      ))}
    </svg>
  )
}

export function sankeyShare(amount: Money): string {
  return amount.amount.dividedBy(MONTHLY_INCOME.amount).times(100).toFixed(1)
}

interface SeriesChartProps {
  values: Decimal[]
  /** A second, quieter series drawn dashed behind the first. */
  context?: Decimal[]
  label: string
  height?: number
  className?: string
}

/**
 * Charts 2.0: a smooth teal line over a 22% → 0 area fade, any context series dashed in grey,
 * and a hollow dot on the latest point. No gridlines.
 */
export function SeriesChart({ values, context, label, height = 200, className }: SeriesChartProps) {
  const gradientId = useId()
  const width = decimal(600)
  const box = decimal(height)
  const all = context ? [...values, ...context] : values
  const low = Decimal.min(...all)
  const high = Decimal.max(...all)
  const toPoints = (series: Decimal[]) =>
    seriesPoints(series, { width, height: box, padding: decimal(10), low, high })

  const points = toPoints(values)
  const line = smoothPath(points)
  const last = points.at(-1)!
  const first = points[0]!

  return (
    <svg
      viewBox={`0 0 600 ${height}`}
      role="img"
      aria-label={label}
      className={`block h-auto w-full overflow-visible ${className ?? ''}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--m-accent)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--m-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${line} L${last.x.toFixed(1)} ${height} L${first.x.toFixed(1)} ${height} Z`}
        fill={`url(#${gradientId})`}
      />
      {context && (
        <path
          d={smoothPath(toPoints(context))}
          fill="none"
          stroke="var(--m-ink-3)"
          strokeWidth="1.5"
          strokeDasharray="4 6"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path
        d={line}
        fill="none"
        stroke="var(--m-accent)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={last.x.toFixed(1)}
        cy={last.y.toFixed(1)}
        r="4"
        fill="var(--m-surface)"
        stroke="var(--m-accent)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** A horizontal share bar: thick, rounded, one segment per holding. */
export function ShareBar({
  rows,
  label,
}: {
  rows: { key: string; share: Decimal; color: string }[]
  label: string
}) {
  return (
    <div role="img" aria-label={label} className="flex h-3.5 gap-0.5 overflow-hidden rounded-full">
      {rows.map((row) => (
        <span
          key={row.key}
          style={{ width: `${row.share.times(100).toFixed(2)}%`, background: row.color }}
        />
      ))}
    </div>
  )
}

export type { Point }
