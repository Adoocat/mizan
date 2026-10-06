import { useTranslation } from 'react-i18next'
import { PageContainer, PageHeader } from '../../components/layout/AppShell'
import { EmptyState } from '../../components/ui/EmptyState'

/** A page whose features arrive in a later phase (see docs/PLAN.md §20). */
export function PlaceholderPage({ page, phase }: { page: string; phase: number }) {
  const { t } = useTranslation()
  return (
    <PageContainer>
      <PageHeader title={t(`pages.${page}.title`)} />
      <EmptyState
        title={t(`pages.${page}.emptyTitle`)}
        description={t('pages.placeholder', { phase })}
      />
    </PageContainer>
  )
}
