import { redirect }                    from 'next/navigation'
import { getDb, user }                 from '@backupos/db'
import { SignUpForm }                   from './form'
import { InviteForm, InviteError }     from './invite-form'
import { getInviteByToken }            from '@/app/actions/invite'

interface Props {
  searchParams: Promise<{ token?: string }>
}

export default async function SignUpPage({ searchParams }: Props) {
  const { token } = await searchParams
  const db = getDb()

  const [existing] = await db.select({ id: user.id }).from(user).limit(1).all()
  const hasUsers   = !!existing

  // First-run: no users yet → show open signup
  if (!hasUsers) {
    return <SignUpForm />
  }

  // Users exist but no invite token → redirect to login
  if (!token) {
    redirect('/login')
  }

  // Token present → validate
  const inv = await getInviteByToken(token)

  if (!inv) {
    return <InviteError reason="invalid" />
  }
  if (!inv.valid) {
    return <InviteError reason={inv.reason as 'used' | 'expired'} />
  }

  return (
    <InviteForm
      token={token}
      email={inv.email}
      name={inv.name}
      inviterName={inv.inviterName}
    />
  )
}
