import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password.ts'

const PASSWORD = 'correct-horse-battery-staple'

describe('password hashing', () => {
  it('produces an Argon2id hash with the OWASP parameters', async () => {
    const hash = await hashPassword(PASSWORD)
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
  })

  it('salts every hash, so the same password hashes differently', async () => {
    const [first, second] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)])
    expect(first).not.toBe(second)
  })

  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword(PASSWORD)
    await expect(verifyPassword({ hash, password: PASSWORD })).resolves.toBe(true)
    await expect(verifyPassword({ hash, password: `${PASSWORD}!` })).resolves.toBe(false)
  })

  it('treats a corrupt hash as a wrong password instead of throwing', async () => {
    await expect(verifyPassword({ hash: 'not-a-hash', password: PASSWORD })).resolves.toBe(false)
    await expect(verifyPassword({ hash: '', password: PASSWORD })).resolves.toBe(false)
  })
})
