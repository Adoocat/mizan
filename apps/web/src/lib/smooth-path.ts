import { Decimal } from '@mizan/domain'

/** A point in an SVG coordinate space. Decimal, so no value ever passes through a float. */
export interface Point {
  x: Decimal
  y: Decimal
}

const SIX = new Decimal(6)

const xy = (point: Point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`

/**
 * Smooths a polyline the way the mockups do: each segment's control points follow the
 * neighbouring points (a Catmull-Rom spline as cubic Béziers), so the curve stays inside the
 * data and never overshoots.
 */
export function smoothPath(points: Point[]): string {
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

/**
 * Maps a series onto a chart box: evenly spaced on x, scaled between the series' own low and
 * high on y (SVG's y grows downward, so the highest value sits at `padding`).
 */
export function seriesPoints(
  values: Decimal[],
  options: { width: Decimal; height: Decimal; padding?: Decimal; low?: Decimal; high?: Decimal },
): Point[] {
  const padding = options.padding ?? new Decimal(0)
  const low = options.low ?? Decimal.min(...values)
  const high = options.high ?? Decimal.max(...values)
  const span = high.minus(low)
  const inner = options.height.minus(padding.times(2))
  const lastIndex = Math.max(values.length - 1, 1)
  return values.map((value, index) => ({
    x: new Decimal(index).dividedBy(lastIndex).times(options.width),
    y: span.isZero()
      ? padding
      : padding.plus(new Decimal(1).minus(value.minus(low).dividedBy(span)).times(inner)),
  }))
}
