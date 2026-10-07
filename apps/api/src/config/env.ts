import { z } from 'zod'

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  WEB_ORIGIN: z.url({ protocol: /^https?$/ }).default('http://localhost:5173'),
  TRUST_PROXY: booleanString,
  /**
   * Signs session cookies and hashes reset tokens. Rotating it invalidates every session.
   * 32 bytes of randomness, e.g. `openssl rand -base64 32`.
   */
  AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  /**
   * Rejects passwords found in the Have I Been Pwned corpus (PLAN §15). On by default; set to
   * false only where an outbound call to a third-party service is unwanted — the automated test
   * suites, or an air-gapped environment.
   */
  AUTH_BREACHED_PASSWORD_CHECK: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
})

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production'
  host: string
  port: number
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
  databaseUrl: string
  webOrigin: string
  trustProxy: boolean
  authSecret: string
  breachedPasswordCheck: boolean
}

export class ConfigError extends Error {
  override name = 'ConfigError'
}

/**
 * Validates environment variables at startup. Error messages name the invalid keys
 * but never echo their values, so secrets can't leak into logs.
 */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const result = envSchema.safeParse(env)
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    throw new ConfigError(`Invalid environment configuration:\n  ${problems.join('\n  ')}`)
  }

  const parsed = result.data
  const config: AppConfig = {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    databaseUrl: parsed.DATABASE_URL,
    webOrigin: new URL(parsed.WEB_ORIGIN).origin,
    trustProxy: parsed.TRUST_PROXY,
    authSecret: parsed.AUTH_SECRET,
    breachedPasswordCheck: parsed.AUTH_BREACHED_PASSWORD_CHECK,
  }

  if (config.nodeEnv === 'production' && new URL(config.webOrigin).protocol !== 'https:') {
    throw new ConfigError(
      'Invalid environment configuration:\n  WEB_ORIGIN: must use https in production',
    )
  }

  return config
}
