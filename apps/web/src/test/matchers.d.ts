import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

/**
 * jest-dom's matchers, declared against **this package's** `vitest`.
 *
 * `@testing-library/jest-dom/vitest` ships its own version of this, but it augments whichever
 * `vitest` resolves from inside jest-dom's own folder — which in a pnpm workspace is whatever
 * instance happens to be hoisted, and that changes whenever another package's peers change. When
 * it resolves to a different copy than the one the tests import, every `toBeInTheDocument` stops
 * type-checking for reasons that have nothing to do with the tests.
 *
 * Declaring it here binds the augmentation to the `vitest` this app depends on, which is the one
 * its tests use. `setup.ts` registers the matchers at runtime with `expect.extend`, so the two
 * halves — the types and the behaviour — are both ours and cannot drift apart.
 */
declare module 'vitest' {
  // Adding members to an existing interface is the whole point here, so the empty bodies are
  // deliberate: the matchers come from the supertype.
  /* eslint-disable @typescript-eslint/no-empty-object-type */
  interface Assertion<
    R extends void | Promise<void> = void,
    T = unknown,
  > extends TestingLibraryMatchers<T, R> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, void> {}
  /* eslint-enable @typescript-eslint/no-empty-object-type */
}
