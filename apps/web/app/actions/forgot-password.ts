'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { checkForgotPasswordRateLimit } from '@/lib/forgot-password-rate-limit'

const GENERIC_OK_MESSAGE = 'If an account exists for that email, a reset link has been sent.'

export async function requestPasswordReset(formData: FormData): Promise<{ message: string; error?: string }> {
  const email = (formData.get('email') as string | null)?.trim().toLowerCase()
  if (!email) return { message: '', error: 'Email is required' }

  const headerStore = await headers()
  const ip = headerStore.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? headerStore.get('x-real-ip')
    ?? 'unknown'

  const rate = checkForgotPasswordRateLimit(email, ip)
  if (!rate.ok) {
    return { message: GENERIC_OK_MESSAGE }
  }

  try {
    await auth.api.requestPasswordReset({
      body: {
        email,
        redirectTo: '/reset-password',
      },
    })
  } catch (err) {
    console.error('[forgot-password]', err)
  }

  return { message: GENERIC_OK_MESSAGE }
}
