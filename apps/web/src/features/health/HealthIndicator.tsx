import { healthResponseSchema } from '@mizan/contracts'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { apiGet } from '../../lib/api-client'

export const healthQueryKey = ['health'] as const

export function useHealth() {
  return useQuery({
    queryKey: healthQueryKey,
    queryFn: ({ signal }) =>
      apiGet('/health', healthResponseSchema, { signal, acceptStatuses: [503] }),
    refetchInterval: 30_000,
    retry: false,
  })
}

type IndicatorState = 'checking' | 'ok' | 'degraded' | 'offline'

const TONES: Record<IndicatorState, BadgeTone> = {
  checking: 'neutral',
  ok: 'positive',
  degraded: 'warning',
  offline: 'negative',
}

export function HealthIndicator() {
  const { t } = useTranslation()
  const health = useHealth()

  let state: IndicatorState = 'checking'
  if (health.isError) state = 'offline'
  else if (health.data) state = health.data.status === 'ok' ? 'ok' : 'degraded'

  return (
    <span role="status" aria-label={t('health.label')} data-testid="health" data-state={state}>
      <Badge tone={TONES[state]}>{t(`health.${state}`)}</Badge>
    </span>
  )
}
