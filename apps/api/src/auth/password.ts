import { hash, verify } from '@node-rs/argon2'

/**
 * Argon2id parameters, from the OWASP Password Storage Cheat Sheet: 19 MiB of memory, two
 * iterations, one lane. Better Auth defaults to scrypt; PLAN §15 asks for Argon2id, so we pass
 * our own hash/verify pair (ADR 0008).
 *
 * `algorithm` is left at the library's default, which is Argon2id. The named constant is an
 * ambient `const enum` and so unusable under `verbatimModuleSyntax`; `password.test.ts` asserts
 * the hash really carries the `$argon2id$` prefix instead of trusting the default.
 */
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS)
}

export async function verifyPassword({
  hash: stored,
  password,
}: {
  hash: string
  password: string
}): Promise<boolean> {
  try {
    return await verify(stored, password)
  } catch {
    // A malformed or truncated hash must read as "wrong password", not as a 500.
    return false
  }
}
