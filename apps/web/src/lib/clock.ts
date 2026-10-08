import type { Clock } from '@mizan/domain'

/**
 * The browser's clock, for the one thing the UI legitimately needs a current date for: filling in
 * today when a form opens. Domain code never reads a clock itself — it takes one — and the API is
 * always the authority on what date a transaction ends up with.
 */
export const browserClock: Clock = { now: () => new Date() }
