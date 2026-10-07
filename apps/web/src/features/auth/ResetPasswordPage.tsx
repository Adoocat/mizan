import { MIN_PASSWORD_LENGTH, passwordSchema } from '@mizan/contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button } from '../../components/ui/Button'
import { FormError, FormNotice, TextField } from '../../components/ui/Field'
import { authClient } from '../../lib/auth-client'
import { AuthLayout, authLinkClass } from './AuthLayout'
import { authErrorMessage } from './auth-errors'
import { useResetPasswordSearch } from './search'
import { onSubmit } from '../../lib/forms'

/** The token travels in the URL, so the form only holds the new password (twice). */
const formSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((value) => value.password === value.confirm, {
    path: ['confirm'],
    message: 'mismatch',
  })

type FormValues = z.infer<typeof formSchema>

export function ResetPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { token, error: linkError } = useResetPasswordSearch()
  const [formError, setFormError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: '', confirm: '' },
  })

  const submit = handleSubmit(async (values) => {
    setFormError(null)
    if (!token) {
      setFormError(t('auth.errors.resetLinkInvalid'))
      return
    }
    const { error } = await authClient.resetPassword({ token, newPassword: values.password })
    if (error) {
      setFormError(authErrorMessage(t, error))
      return
    }
    setDone(true)
  })

  const linkIsUnusable = !token || Boolean(linkError)

  return (
    <AuthLayout
      title={t('auth.reset.title')}
      lead={linkIsUnusable ? undefined : t('auth.reset.lead')}
      footer={
        <Link to="/sign-in" className={authLinkClass}>
          {t('auth.forgot.backToSignIn')}
        </Link>
      }
    >
      {linkIsUnusable ? (
        <>
          <FormError>{t('auth.errors.resetLinkInvalid')}</FormError>
          <Link to="/forgot-password" className={authLinkClass}>
            {t('auth.reset.requestAnother')}
          </Link>
        </>
      ) : done ? (
        <>
          <FormNotice>{t('auth.reset.done')}</FormNotice>
          <Button
            variant="primary"
            onClick={() => void navigate({ to: '/sign-in', replace: true })}
          >
            {t('auth.signIn.submit')}
          </Button>
        </>
      ) : (
        <form noValidate onSubmit={onSubmit(submit)} className="flex flex-col gap-1">
          <FormError>{formError}</FormError>

          <TextField
            label={t('auth.fields.newPassword')}
            type="password"
            autoComplete="new-password"
            hint={t('auth.signUp.passwordHint', { count: MIN_PASSWORD_LENGTH })}
            error={errors.password && t('auth.errors.passwordTooShort')}
            {...register('password')}
          />

          <TextField
            label={t('auth.fields.confirmPassword')}
            type="password"
            autoComplete="new-password"
            error={errors.confirm && t('auth.errors.passwordMismatch')}
            {...register('confirm')}
          />

          <Button type="submit" variant="primary" loading={isSubmitting} className="mt-3">
            {t('auth.reset.submit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
