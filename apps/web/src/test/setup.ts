import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { initI18n } from '../lib/i18n'

// jsdom has no matchMedia; the toaster and theme code query it.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// jsdom implements no pointer capture; Sonner calls it when a toast is pressed (e.g. Undo).
for (const method of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'] as const) {
  if (!(method in Element.prototype)) {
    Object.defineProperty(Element.prototype, method, { value: () => false, writable: true })
  }
}

await initI18n('en')

afterEach(() => {
  cleanup()
})
