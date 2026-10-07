import { signInSchema, type SignInInput } from '@mizan/contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button'
import { FormError, TextField } from '../../components/ui/Field'
import { authClient } from '../../lib/auth-client'
import { AuthLayout, authLinkClass } from './AuthLayout'
import { authErrorMessage } from './auth-errors'
import { useSignInSearch } from './search'
import { invalidateSession } from './session'
import { onSubmit } from '../../lib/forms'

export function SignInPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { redirect } = useSignInSearch()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  })

  const submit = handleSubmit(async (values) => {
    setFormError(null)
    const { error } = await authClient.signIn.email(values)
    if (error) {
      setFormError(authErrorMessage(t, error))
      return
    }
    await invalidateSession(queryClient)
    await navigate({ to: redirect ?? '/', replace: true })
  })

  return (
    <AuthLayout
      title={t('auth.signIn.title')}
      lead={t('auth.signIn.lead')}
      footer={
        <>
          {t('auth.signIn.noAccount')}{' '}
          <Link to="/sign-up" className={authLinkClass}>
            {t('auth.signIn.createOne')}
          </Link>
        </>
      }
    >
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

        <TextField
          label={t('auth.fields.password')}
          type="password"
          autoComplete="current-password"
          error={errors.password && t('auth.errors.passwordRequired')}
          {...register('password')}
        />

        <div className="mb-3 flex justify-end">
          <Link to="/forgot-password" className={`text-body ${authLinkClass}`}>
            {t('auth.signIn.forgot')}
          </Link>
        </div>

        <Button type="submit" variant="primary" loading={isSubmitting}>
          {t('auth.signIn.submit')}
        </Button>
      </form>
    </AuthLayout>
  )
}
