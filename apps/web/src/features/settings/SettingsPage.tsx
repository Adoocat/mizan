import { useTranslation } from 'react-i18next'
import { PageContainer, PageHeader } from '../../components/layout/AppShell'
import { PrivacyToggle, ThemeSwitch } from '../../components/layout/Preferences'
import { Card, CardTitle } from '../../components/ui/Card'
import { CategorySettings } from '../categories/CategorySettings'
import { PasswordCard } from './PasswordCard'
import { ProfileCard } from './ProfileCard'
import { WorkspaceCard } from './WorkspaceCard'

export function SettingsPage() {
  const { t } = useTranslation()
  return (
    <PageContainer>
      <PageHeader title={t('pages.settings.title')} />

      <ProfileCard />
      <WorkspaceCard />
      <PasswordCard />
      <CategorySettings />

      <Card className="flex max-w-md flex-col gap-4">
        <CardTitle>{t('pages.settings.appearance')}</CardTitle>
        <div className="flex flex-col gap-1.5">
          <span className="text-label text-ink-3">{t('theme.label')}</span>
          <ThemeSwitch />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-label text-ink-3">{t('privacy.label')}</span>
          <PrivacyToggle className="self-start" />
        </div>
      </Card>

      {/* Data export and account deletion arrive with their own phases (PLAN §13). */}
      <p className="m-0 text-caption text-ink-3">{t('settings.moreLater')}</p>
    </PageContainer>
  )
}
