import {
  changePasswordSchema,
  MIN_PASSWORD_LENGTH,
  type ChangePasswordInput,
} from '@mizan/contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button'
import { Card, CardTitle } from '../../components/ui/Card'
import { FormError, FormNotice, TextField } from '../../components/ui/Field'
import { authClient } from '../../lib/auth-client'
import { authErrorMessage } from '../auth/auth-errors'
import { onSubmit } from '../../lib/forms'

export function PasswordCard() {
  const { t } = useTranslation()
  const [formError, setFormError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  })

  const submit = handleSubmit(async (values) => {
    setFormError(null)
    setDone(false)
    const { error } = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      // Other devices keep their session; "sign out everywhere" is its own action (v1.1).
      revokeOtherSessions: false,
    })
    if (error) {
      setFormError(authErrorMessage(t, error))
      return
    }
    reset()
    setDone(true)
  })

  return (
    <Card className="flex max-w-md flex-col gap-4">
      <CardTitle>{t('settings.password.title')}</CardTitle>

      <FormError>{formError}</FormError>
      {done && <FormNotice>{t('settings.password.changed')}</FormNotice>}

      <form noValidate onSubmit={onSubmit(submit)} className="flex flex-col gap-1">
        <TextField
          label={t('auth.fields.currentPassword')}
          type="password"
          autoComplete="current-password"
          error={errors.currentPassword && t('auth.errors.passwordRequired')}
          {...register('currentPassword')}
        />

        <TextField
          label={t('auth.fields.newPassword')}
          type="password"
          autoComplete="new-password"
          hint={t('auth.signUp.passwordHint', { count: MIN_PASSWORD_LENGTH })}
          error={errors.newPassword && t('auth.errors.passwordTooShort')}
          {...register('newPassword')}
        />

        <Button type="submit" variant="primary" className="mt-3 self-start" loading={isSubmitting}>
          {t('settings.password.submit')}
        </Button>
      </form>
    </Card>
  )
}
