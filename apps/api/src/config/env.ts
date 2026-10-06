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
})

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production'
  host: string
  port: number
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
  databaseUrl: string
  webOrigin: string
  trustProxy: boolean
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
  }

  if (config.nodeEnv === 'production' && new URL(config.webOrigin).protocol !== 'https:') {
    throw new ConfigError(
      'Invalid environment configuration:\n  WEB_ORIGIN: must use https in production',
    )
  }

  return config
}
