import type { FormEvent } from 'react'

/**
 * Adapts React Hook Form's async submit handler to the DOM's synchronous `onSubmit`.
 *
 * `handleSubmit` returns a promise and resolves it itself (it catches, and surfaces failures
 * through form state), so discarding it is correct — but it has to be explicit, or
 * `no-misused-promises` flags an unhandled promise in JSX.
 */
export function onSubmit(handler: (event: FormEvent<HTMLFormElement>) => Promise<unknown>) {
  return (event: FormEvent<HTMLFormElement>) => {
    void handler(event)
  }
}
