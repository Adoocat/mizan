import { useEffect, useRef } from 'react'

/** Does this visitor want motion? Checked at mount, never cached across sessions. */
export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** How long to wait for the observer before deciding it isn't coming. */
const FALLBACK_MS = 2500

/**
 * Reveals elements once as they scroll into view, then leaves them alone — 2.0 §00: "Motion
 * reveals once, on scroll, then stays still."
 *
 * Elements opt in with `data-reveal` (the variant, styled in `styles.css`) and an optional
 * `data-reveal-delay` in ms. Two things need care:
 *
 * - A masked line starts translated outside its own `overflow-hidden` wrapper, and a clipped
 *   panel has no visible area at all, so neither ever reports as intersecting. Both carry a
 *   `data-reveal-trigger` ancestor, and that is what gets watched.
 * - The content is invisible until the observer says otherwise, so anything that stops the
 *   observer — reduced motion, no IntersectionObserver, or a document that is never visible
 *   (an embedded or background view, where callbacks are not delivered) — must still end with
 *   everything revealed. Hence the fallback.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))

    const reveal = (element: HTMLElement) => {
      const delay = Number.parseInt(element.dataset.revealDelay ?? '0', 10)
      if (delay > 0) {
        window.setTimeout(() => {
          element.dataset.revealed = 'true'
        }, delay)
      } else {
        element.dataset.revealed = 'true'
      }
    }
    const revealAll = () => {
      for (const target of targets) target.dataset.revealed = 'true'
    }

    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      revealAll()
      return
    }

    // Group each element under whatever the observer can actually see.
    const groups = new Map<Element, HTMLElement[]>()
    for (const target of targets) {
      const trigger = target.closest<HTMLElement>('[data-reveal-trigger]') ?? target
      const group = groups.get(trigger)
      if (group) group.push(target)
      else groups.set(trigger, [target])
    }

    let delivered = false
    const observer = new IntersectionObserver(
      (entries) => {
        delivered = true
        for (const entry of entries) {
          // A fast scroll can carry a section past the viewport without ever reporting an
          // intersection, so anything already above the fold counts as revealed too.
          const passed = entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0)
          if (!entry.isIntersecting && !passed) continue
          for (const element of groups.get(entry.target) ?? []) reveal(element)
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0 },
    )
    for (const trigger of groups.keys()) observer.observe(trigger)

    // If no callback ever arrives, show everything rather than leave the page blank.
    const fallback = window.setTimeout(() => {
      if (!delivered) revealAll()
    }, FALLBACK_MS)

    return () => {
      window.clearTimeout(fallback)
      observer.disconnect()
    }
  }, [])

  return ref
}
