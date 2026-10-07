import { Decimal, decimal, type Money } from '@mizan/domain'
import { useId } from 'react'
import { cn } from '../../lib/cn'

export interface CashFlowPoint {
  key: string
  label: string
  income: Money
  spending: Money
}

/** A point in the SVG's coordinate space. Kept as Decimal — no value becomes a float. */
interface Point {
  x: Decimal
  y: Decimal
}

const WIDTH = decimal(600)
const HEIGHT = decimal(180)
/** Headroom above the tallest value, so the line never touches the top edge. */
const HEADROOM = decimal('1.1')
const SIX = decimal(6)

const xy = (point: Point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`

/**
 * Smooths a polyline the way the mockup does: each segment's control points follow the
 * neighbouring points (a Catmull-Rom spline converted to cubic Béziers), so the curve stays
 * inside the data and never overshoots.
 */
function smoothPath(points: Point[]): string {
  const first = points[0]
  if (!first) return ''
  let d = `M${xy(first)}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index]!
    const current = points[index]!
    const next = points[index + 1]!
    const after = points[index + 2] ?? next
    const c1: Point = {
      x: current.x.plus(next.x.minus(previous.x).dividedBy(SIX)),
      y: current.y.plus(next.y.minus(previous.y).dividedBy(SIX)),
    }
    const c2: Point = {
      x: next.x.minus(after.x.minus(current.x).dividedBy(SIX)),
      y: next.y.minus(after.y.minus(current.y).dividedBy(SIX)),
    }
    d += ` C${xy(c1)} ${xy(c2)} ${xy(next)}`
  }
  return d
}

interface CashFlowChartProps {
  points: CashFlowPoint[]
  label: string
  className?: string
}

/**
 * Charts 2.0 (design system §00): smooth curves, no gridlines, one teal series (spending) with
 * the context series (income) dashed in grey, and the area under the line fading 22% → 0.
 */
export function CashFlowChart({ points, label, className }: CashFlowChartProps) {
  const gradientId = useId()
  if (points.length === 0) return null

  const highest = points.reduce(
    (max, point) => Decimal.max(max, point.income.amount, point.spending.amount),
    decimal(0),
  )
  const ceiling = highest.times(HEADROOM)
  const count = decimal(points.length)
  const x = (index: number) => decimal(index).plus('0.5').dividedBy(count).times(WIDTH)
  const y = (money: Money) =>
    ceiling.isZero() ? HEIGHT : HEIGHT.minus(money.amount.dividedBy(ceiling).times(HEIGHT))

  const incomePoints = points.map((point, index) => ({ x: x(index), y: y(point.income) }))
  const spendingPoints = points.map((point, index) => ({ x: x(index), y: y(point.spending) }))
  const spendingPath = smoothPath(spendingPoints)
  const firstPoint = spendingPoints[0]!
  const lastPoint = spendingPoints.at(-1)!
  const baseline = HEIGHT.toFixed(1)

  return (
    <svg
      viewBox={`0 0 ${WIDTH.toFixed(0)} ${HEIGHT.toFixed(0)}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
      className={cn('block h-[180px] w-full', className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--m-accent)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--m-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${spendingPath} L${lastPoint.x.toFixed(1)} ${baseline} L${firstPoint.x.toFixed(1)} ${baseline} Z`}
        fill={`url(#${gradientId})`}
      />
      <path
        d={smoothPath(incomePoints)}
        fill="none"
        stroke="var(--m-ink-3)"
        strokeWidth="1.5"
        strokeDasharray="4 5"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={spendingPath}
        fill="none"
        stroke="var(--m-accent)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      {spendingPoints.map((point, index) => {
        const latest = index === spendingPoints.length - 1
        return (
          <circle
            key={points[index]!.key}
            cx={point.x.toFixed(1)}
            cy={point.y.toFixed(1)}
            r={latest ? 4 : 3}
            fill={latest ? 'var(--m-surface)' : 'var(--m-accent)'}
            stroke="var(--m-accent)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
    </svg>
  )
}
