import { displayNameSchema, localeSchema } from '@mizan/contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button } from '../../components/ui/Button'
import { Card, CardTitle } from '../../components/ui/Card'
import { FormError, FormNotice, SelectField, TextField } from '../../components/ui/Field'
import { ApiError } from '../../lib/api-client'
import { storeLanguage, SUPPORTED_LANGUAGES } from '../../lib/i18n'
import { useCurrentSession, useUpdateProfile } from '../auth/session'
import { onSubmit } from '../../lib/forms'

const formSchema = z.object({ name: displayNameSchema, locale: localeSchema })
type FormValues = z.infer<typeof formSchema>

/** Name, email and UI language. The email is fixed in the MVP (changing it arrives in v1.1). */
export function ProfileCard() {
  const { t, i18n } = useTranslation()
  const { user } = useCurrentSession()
  const update = useUpdateProfile()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: { name: user.name, locale: user.locale },
  })

  // The stored language is per device; keep it in step with the account's choice.
  useEffect(() => {
    if (i18n.language === user.locale) return
    storeLanguage(user.locale)
    void i18n.changeLanguage(user.locale)
  }, [user.locale, i18n])

  // `mutate`, not `mutateAsync`: a rejected save belongs in `update.error`, which the form
  // already renders. Awaiting it here would surface the same failure a second time, unhandled.
  const submit = handleSubmit((values) => {
    update.mutate(values, {
      onSuccess: (next) => reset({ name: next.user.name, locale: next.user.locale }),
    })
  })

  return (
    <Card className="flex max-w-md flex-col gap-4">
      <CardTitle>{t('settings.profile.title')}</CardTitle>

      {update.error && (
        <FormError>
          {update.error instanceof ApiError
            ? (update.error.detail ?? t('settings.saveFailed'))
            : t('settings.saveFailed')}
        </FormError>
      )}
      {update.isSuccess && !isDirty && <FormNotice>{t('settings.saved')}</FormNotice>}

      <form noValidate onSubmit={onSubmit(submit)} className="flex flex-col gap-1">
        <TextField
          label={t('auth.fields.name')}
          autoComplete="name"
          error={errors.name && t('auth.errors.nameRequired')}
          {...register('name')}
        />

        <TextField
          label={t('auth.fields.email')}
          value={user.email}
          readOnly
          disabled
          hint={t('settings.profile.emailFixed')}
        />

        <SelectField
          label={t('language.label')}
          options={SUPPORTED_LANGUAGES.map((value) => ({ value, label: t(`language.${value}`) }))}
          {...register('locale')}
        />

        <Button
          type="submit"
          variant="primary"
          className="mt-3 self-start"
          disabled={!isDirty}
          loading={update.isPending}
        >
          {t('settings.save')}
        </Button>
      </form>
    </Card>
  )
}
