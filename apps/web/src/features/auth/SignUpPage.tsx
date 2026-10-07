import { MIN_PASSWORD_LENGTH, signUpSchema, type SignUpInput } from '@mizan/contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button'
import { FormError, TextField } from '../../components/ui/Field'
import { apiPatch } from '../../lib/api-client'
import { authClient } from '../../lib/auth-client'
import { isLanguage } from '../../lib/i18n'
import { meResponseSchema } from '@mizan/contracts'
import { AuthLayout, authLinkClass } from './AuthLayout'
import { authErrorMessage } from './auth-errors'
import { invalidateSession } from './session'
import { onSubmit } from '../../lib/forms'

export function SignUpPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: '', email: '', password: '' },
  })

  const submit = handleSubmit(async (values) => {
    setFormError(null)
    const { error } = await authClient.signUp.email(values)
    if (error) {
      setFormError(authErrorMessage(t, error))
      return
    }

    // Sign-up cannot carry the language (the API rejects unvalidated profile fields on that
    // endpoint), so the UI language is saved straight after, on the new session.
    if (isLanguage(i18n.language) && i18n.language !== 'en') {
      await apiPatch('/me', { locale: i18n.language }, meResponseSchema).catch(() => undefined)
    }

    await invalidateSession(queryClient)
    await navigate({ to: '/', replace: true })
  })

  return (
    <AuthLayout
      title={t('auth.signUp.title')}
      lead={t('auth.signUp.lead')}
      footer={
        <>
          {t('auth.signUp.haveAccount')}{' '}
          <Link to="/sign-in" className={authLinkClass}>
            {t('auth.signUp.signInInstead')}
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={onSubmit(submit)} className="flex flex-col gap-1">
        <FormError>{formError}</FormError>

        <TextField
          label={t('auth.fields.name')}
          autoComplete="name"
          error={errors.name && t('auth.errors.nameRequired')}
          {...register('name')}
        />

        <TextField
          label={t('auth.fields.email')}
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          error={errors.email && t('auth.errors.invalidEmail')}
          {...register('email')}
        />

        <TextField
          label={t('auth.fields.password')}
          type="password"
          autoComplete="new-password"
          hint={t('auth.signUp.passwordHint', { count: MIN_PASSWORD_LENGTH })}
          error={errors.password && t('auth.errors.passwordTooShort')}
          {...register('password')}
        />

        <Button type="submit" variant="primary" loading={isSubmitting} className="mt-3">
          {t('auth.signUp.submit')}
        </Button>
      </form>
    </AuthLayout>
  )
}
