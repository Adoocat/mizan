/**
 * Per-account limits for the credential endpoints, layered on top of Better Auth's per-IP limits
 * (PLAN §15: "per IP and account"). Without this, an attacker spread across many addresses could
 * grind one account's password unchecked.
 *
 * Only *failed* attempts count, so a user signing in on several devices is never locked out by
 * their own success. State is a fixed window held in memory, which is right for a single
 * instance; a shared store is part of the phase 12 rate-limit review.
 */
export interface RateLimitRule {
  /** Window length in seconds. */
  windowSeconds: number
  /** Failures allowed inside one window. */
  max: number
}

export interface RateLimitDecision {
  allowed: boolean
  /** Seconds until the window frees up, for the `Retry-After` header. */
  retryAfter: number
}

interface Window {
  resetAtMs: number
  failures: number
}

/** Bounds memory under a spray attack; expired windows are dropped first. */
const MAX_TRACKED_KEYS = 10_000

export interface AccountRateLimiter {
  /** Whether another attempt is allowed. Does not count anything. */
  check(key: string): RateLimitDecision
  /** Records a failed attempt. */
  recordFailure(key: string): void
  /** Clears the key after a success, so a correct password resets the budget. */
  reset(key: string): void
  readonly size: number
}

export function createAccountRateLimiter(
  rule: RateLimitRule,
  now: () => number = Date.now,
): AccountRateLimiter {
  const windows = new Map<string, Window>()

  function current(key: string): Window | undefined {
    const window = windows.get(key)
    if (!window) return undefined
    if (window.resetAtMs <= now()) {
      windows.delete(key)
      return undefined
    }
    return window
  }

  function prune() {
    const nowMs = now()
    for (const [key, window] of windows) {
      if (window.resetAtMs <= nowMs) windows.delete(key)
    }
    // Still full of live windows: drop the oldest insertions (Map keeps insertion order).
    while (windows.size >= MAX_TRACKED_KEYS) {
      const oldest = windows.keys().next()
      if (oldest.done) break
      windows.delete(oldest.value)
    }
  }

  return {
    check(key) {
      const window = current(key)
      if (!window || window.failures < rule.max) return { allowed: true, retryAfter: 0 }
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((window.resetAtMs - now()) / 1000)),
      }
    },

    recordFailure(key) {
      const window = current(key)
      if (window) {
        window.failures += 1
        return
      }
      if (windows.size >= MAX_TRACKED_KEYS) prune()
      windows.set(key, { resetAtMs: now() + rule.windowSeconds * 1000, failures: 1 })
    },

    reset(key) {
      windows.delete(key)
    },

    get size() {
      return windows.size
    },
  }
}
