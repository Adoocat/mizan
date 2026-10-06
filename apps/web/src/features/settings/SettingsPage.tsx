import { useTranslation } from 'react-i18next'
import { PageContainer, PageHeader } from '../../components/layout/AppShell'
import { LanguageSwitch, PrivacyToggle, ThemeSwitch } from '../../components/layout/Preferences'
import { Card, CardTitle } from '../../components/ui/Card'

export function SettingsPage() {
  const { t } = useTranslation()
  return (
    <PageContainer>
      <PageHeader title={t('pages.settings.title')} />
      <Card className="flex max-w-md flex-col gap-4">
        <CardTitle>{t('pages.settings.appearance')}</CardTitle>
        <div className="flex flex-col gap-1.5">
          <span className="text-label text-ink-3">{t('theme.label')}</span>
          <ThemeSwitch />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-label text-ink-3">{t('language.label')}</span>
          <LanguageSwitch />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-label text-ink-3">{t('privacy.label')}</span>
          <PrivacyToggle className="self-start" />
        </div>
      </Card>
      <p className="m-0 text-body text-ink-2">{t('pages.placeholder', { phase: 3 })}</p>
    </PageContainer>
  )
}
