import { fromParts, type PlainDate } from './dates.ts'

/**
 * Source of the current instant. Domain code never reads the system clock; callers inject one.
 * Apps provide a system clock; tests use `fixedClock`.
 */
export interface Clock {
  now(): Date
}

export const DEFAULT_TIME_ZONE = 'Europe/Istanbul'

export function fixedClock(instant: string | Date): Clock {
  const epochMs = new Date(instant).getTime()
  if (Number.isNaN(epochMs)) throw new RangeError('fixedClock needs a valid instant')
  return { now: () => new Date(epochMs) }
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      calendar: 'gregory',
      numberingSystem: 'latn',
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

/** The calendar date of an instant in a time zone. */
export function plainDateInZone(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): PlainDate {
  const parts = new Map(
    formatterFor(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  )
  // A missing part parses as NaN and fromParts rejects it.
  const get = (type: Intl.DateTimeFormatPartTypes) => Number.parseInt(String(parts.get(type)), 10)
  return fromParts(get('year'), get('month'), get('day'))
}

/** Today's date in a time zone (Europe/Istanbul by default). */
export function todayIn(clock: Clock, timeZone: string = DEFAULT_TIME_ZONE): PlainDate {
  return plainDateInZone(clock.now(), timeZone)
}
