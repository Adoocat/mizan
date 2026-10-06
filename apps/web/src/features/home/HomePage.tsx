import { useTranslation } from 'react-i18next'
import { PageContainer, PageHeader } from '../../components/layout/AppShell'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { HealthIndicator } from '../health/HealthIndicator'

export function HomePage() {
  const { t } = useTranslation()
  return (
    <PageContainer>
      <PageHeader title={t('pages.home.title')} />
      <p className="m-0 text-body text-ink-2">{t('app.tagline')}</p>
      <EmptyState
        title={t('pages.home.emptyTitle')}
        description={t('pages.placeholder', { phase: 11 })}
      />
      <Card className="flex items-center justify-between gap-3 p-4">
        <span className="text-label text-ink-3">{t('health.label')}</span>
        <HealthIndicator />
      </Card>
    </PageContainer>
  )
}
