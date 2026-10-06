import { useTranslation } from 'react-i18next'
import { HealthIndicator } from '../health/HealthIndicator'

export function HomePage() {
  const { t } = useTranslation()
  return (
    <main>
      <h1>{t('app.name')}</h1>
      <p>{t('app.tagline')}</p>
      <HealthIndicator />
    </main>
  )
}
