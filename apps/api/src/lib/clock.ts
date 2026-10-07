import type { Clock } from '@mizan/domain'

/**
 * The one place the API reads the system clock. Domain code never does: it takes a `Clock`, which
 * is what makes period and safe-to-spend arithmetic testable at a fixed instant.
 */
export const systemClock: Clock = { now: () => new Date() }
