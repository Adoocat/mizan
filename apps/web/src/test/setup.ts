import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { initI18n } from '../lib/i18n'

await initI18n('en')

afterEach(() => {
  cleanup()
})
