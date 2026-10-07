import { forgotPasswordSchema, type ForgotPasswordInput } from '@mizan/contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button'
import { FormError, FormNotice, TextField } from '../../components/ui/Field'
import { authClient } from '../../lib/auth-client'
import { AuthLayout, authLinkClass } from './AuthLayout'
import { authErrorMessage } from './auth-errors'
import { onSubmit } from '../../lib/forms'

/** Where the mailed link lands. The API redirects the browser here with `?token=…`. */
export const RESET_PASSWORD_PATH = '/reset-password'

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [formError, setFormError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  const submit = handleSubmit(async (values) => {
    setFormError(null)
    const { error } = await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: RESET_PASSWORD_PATH,
    })
    if (error) {
      setFormError(authErrorMessage(t, error))
      return
    }
    // The answer is the same whether or not the address has an account (PLAN §15).
    setSent(true)
  })

  return (
    <AuthLayout
      title={t('auth.forgot.title')}
      lead={t('auth.forgot.lead')}
      footer={
        <Link to="/sign-in" className={authLinkClass}>
          {t('auth.forgot.backToSignIn')}
        </Link>
      }
    >
      {sent ? (
        <FormNotice>{t('auth.forgot.sent')}</FormNotice>
      ) : (
        <form noValidate onSubmit={onSubmit(submit)} className="flex flex-col gap-1">
          <FormError>{formError}</FormError>

          <TextField
            label={t('auth.fields.email')}
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            error={errors.email && t('auth.errors.invalidEmail')}
            {...register('email')}
          />

          <Button type="submit" variant="primary" loading={isSubmitting} className="mt-3">
            {t('auth.forgot.submit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
