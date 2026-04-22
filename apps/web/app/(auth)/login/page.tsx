import { redirect } from 'next/navigation'
import { getDb, user } from '@backupos/db'
import { LoginForm } from './form'

export default async function LoginPage() {
  const db = getDb()
  const [existing] = await db.select({ id: user.id }).from(user).limit(1).all()

  // No users yet — send to first-run setup
  if (!existing) redirect('/signup')

  return <LoginForm />
}
