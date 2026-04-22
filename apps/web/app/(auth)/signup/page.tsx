import { redirect } from 'next/navigation'
import { getDb, user } from '@backupos/db'
import { SignUpForm } from './form'

export default async function SignUpPage() {
  const db = getDb()
  const [existing] = await db.select({ id: user.id }).from(user).limit(1).all()

  // Only allow signup when no users exist (first-run setup)
  if (existing) redirect('/login')

  return <SignUpForm />
}
