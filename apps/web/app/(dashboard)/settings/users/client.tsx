'use client'

import { useState, useTransition } from 'react'
import { createInvite, revokeInvite, resendInviteEmail, createUserDirect, updateUserRole } from '@/app/actions/invite'
import { copyToClipboard } from '@/lib/copy-to-clipboard'

interface UserRow {
  id:        string
  name:      string
  email:     string
  role:      string
  createdAt: number
}

interface InviteRow {
  id:        string
  email:     string
  name:      string | null
  token:     string
  expiresAt: number
  usedAt:    number | null
  createdAt: number
}

interface Props {
  users:                UserRow[]
  invites:              InviteRow[]
  baseUrl:              string
  smtpConfigured:       boolean
  currentUserId:        string
  currentUserIsAdmin:   boolean
}

function fmt(ms: number) {
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const ROLE_LABELS: Record<string, string> = { admin: 'Admin', viewer: 'Viewer' }

export function UsersClient({ users: initialUsers, invites: initialInvites, baseUrl, smtpConfigured, currentUserId, currentUserIsAdmin }: Props) {
  const [users,    setUsers]    = useState(initialUsers)
  const [invites,  setInvites]  = useState(initialInvites)
  const [newLink,  setNewLink]  = useState<string | null>(null)
  const [copied,   setCopied]   = useState(false)
  const [error,    setError]    = useState('')
  const [showForm, setShowForm] = useState(false)
  const [resentId, setResentId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Create user directly
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createError,    setCreateError]    = useState('')
  const [createdResult,  setCreatedResult]  = useState<{ name: string; email: string; tempPassword?: string } | null>(null)
  const [createCopied,   setCreateCopied]   = useState(false)

  const pendingInvites = invites.filter(i => i.usedAt === null && i.expiresAt > Date.now())

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setNewLink(null)
    const fd     = new FormData(e.currentTarget)
    const result = await createInvite(fd)
    if (result.error) { setError(result.error); return }
    setNewLink(result.link!)
    setShowForm(false)
    ;(e.target as HTMLFormElement).reset()
    const token = result.link!.split('token=')[1] ?? ''
    const email = fd.get('email') as string
    const name  = fd.get('name')  as string | null
    setInvites(prev => [...prev, {
      id:        result.id!,
      email,
      name,
      token,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      usedAt:    null,
      createdAt: Date.now(),
    }])
  }

  async function handleCreateUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setCreateError('')
    setCreatedResult(null)
    const fd     = new FormData(e.currentTarget)
    const result = await createUserDirect(fd)
    if (result.error) { setCreateError(result.error); return }
    setCreatedResult({ name: result.name!, email: result.email!, tempPassword: result.tempPassword })
    setShowCreateForm(false)
    ;(e.target as HTMLFormElement).reset()
    setUsers(prev => [...prev, {
      id:        result.id!,
      name:      result.name!,
      email:     result.email!,
      role:      'viewer',
      createdAt: result.createdAt!,
    }])
  }

  function handleRevoke(id: string) {
    startTransition(async () => {
      await revokeInvite(id)
      setInvites(prev => prev.filter(i => i.id !== id))
    })
  }

  function handleRoleChange(userId: string, role: 'admin' | 'viewer') {
    startTransition(async () => {
      const result = await updateUserRole(userId, role)
      if (!result.error) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u))
      }
    })
  }

  function copyLink(link: string) {
    copyToClipboard(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box',
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
  }
  const btnPrimary: React.CSSProperties = {
    padding: '8px 16px', background: 'var(--accent)', color: 'var(--accent-fg)',
    border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap',
  }
  const btnGhost: React.CSSProperties = {
    padding: '6px 12px', background: 'var(--surf2)', color: 'var(--fg)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
    fontSize: 12, cursor: 'pointer',
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <a href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 24 }}>← Settings</a>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>Users</h1>
          <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: '4px 0 0' }}>
            Manage who has access to this BackupOS installation.
            {!smtpConfigured && <span style={{ color: 'var(--warn)' }}> · SMTP not configured — invites are link-only.</span>}
          </p>
        </div>
        {currentUserIsAdmin && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnGhost} onClick={() => { setShowCreateForm(f => !f); setShowForm(false) }}>
              {showCreateForm ? 'Cancel' : 'Create user'}
            </button>
            <button style={btnPrimary} onClick={() => { setShowForm(f => !f); setShowCreateForm(false) }}>
              {showForm ? 'Cancel' : 'Invite user'}
            </button>
          </div>
        )}
      </div>

      {!currentUserIsAdmin && (
        <div style={{
          padding: '10px 16px', marginBottom: 20,
          backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--fg-dim)',
        }}>
          View-only — admin role required to invite or manage users.
        </div>
      )}

      {/* Invite form (admin only) */}
      {currentUserIsAdmin && showForm && (
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>Send an invite</div>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', marginBottom: 4 }}>Email *</label>
                <input name="email" type="email" required placeholder="colleague@example.com" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', marginBottom: 4 }}>Name (optional)</label>
                <input name="name" type="text" placeholder="Jane Doe" style={inputStyle} />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', marginBottom: 4 }}>Role</label>
              <select name="role" defaultValue="viewer" style={{ ...inputStyle, width: 'auto' }}>
                <option value="viewer">Viewer — read-only access</option>
                <option value="admin">Admin — full access</option>
              </select>
            </div>
            {error && <div style={{ fontSize: 13, color: 'var(--err)', marginBottom: 12 }}>{error}</div>}
            <button type="submit" style={btnPrimary} disabled={pending}>
              {smtpConfigured ? 'Send invite email + get link' : 'Create invite link'}
            </button>
          </form>
        </div>
      )}

      {/* Create user form (admin only) */}
      {currentUserIsAdmin && showCreateForm && (
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Create user directly</div>
          <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginBottom: 16 }}>Account is created immediately with email verified. Leave password blank to auto-generate.</div>
          <form onSubmit={handleCreateUser}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', marginBottom: 4 }}>Name *</label>
                <input name="name" type="text" required placeholder="Jane Doe" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', marginBottom: 4 }}>Email *</label>
                <input name="email" type="email" required placeholder="jane@example.com" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', marginBottom: 4 }}>Initial password (optional)</label>
                <input name="password" type="password" placeholder="Leave blank to auto-generate" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', marginBottom: 4 }}>Role</label>
                <select name="role" defaultValue="viewer" style={inputStyle}>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            {createError && <div style={{ fontSize: 13, color: 'var(--err)', marginBottom: 12 }}>{createError}</div>}
            <button type="submit" style={btnPrimary} disabled={pending}>Create account</button>
          </form>
        </div>
      )}

      {/* Create user success banner */}
      {createdResult && (
        <div style={{ backgroundColor: 'var(--ok-dim)', border: '1px solid color-mix(in srgb, var(--ok) 30%, transparent)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ok)', marginBottom: 6 }}>
            Account created for {createdResult.name} ({createdResult.email})
          </div>
          {createdResult.tempPassword ? (
            <div>
              <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginBottom: 4 }}>Temporary password — share securely, shown once:</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg)', wordBreak: 'break-all', flex: 1 }}>{createdResult.tempPassword}</div>
                <button style={btnGhost} onClick={() => {
                  copyToClipboard(createdResult.tempPassword!).then(() => {
                    setCreateCopied(true)
                    setTimeout(() => setCreateCopied(false), 2000)
                  })
                }}>
                  {createCopied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>User can log in with the password you set.</div>
          )}
        </div>
      )}

      {/* New link success banner */}
      {newLink && (
        <div style={{ backgroundColor: 'var(--ok-dim)', border: '1px solid color-mix(in srgb, var(--ok) 30%, transparent)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ok)', marginBottom: 4 }}>Invite created{smtpConfigured ? ' — email sent' : ''}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)', wordBreak: 'break-all' }}>{newLink}</div>
          </div>
          <button style={btnGhost} onClick={() => copyLink(newLink)}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      )}

      {/* Active users */}
      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border2)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
          Active users ({users.length})
        </div>
        {users.map((u, i) => (
          <div key={u.id} style={{ padding: '14px 20px', borderTop: i === 0 ? 'none' : '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              backgroundColor: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#000', flexShrink: 0,
            }}>
              {u.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>
                {u.name}
                {u.id === currentUserId && <span style={{ fontSize: 11, color: 'var(--fg-dim)', marginLeft: 8 }}>you</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>{u.email}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-dim)', flexShrink: 0 }}>Joined {fmt(u.createdAt)}</div>
            {/* Role: dropdown for other users (admin only), plain text for self */}
            {currentUserIsAdmin && u.id !== currentUserId ? (
              <select
                value={u.role}
                disabled={pending}
                onChange={e => handleRoleChange(u.id, e.target.value as 'admin' | 'viewer')}
                style={{
                  padding: '4px 8px', fontSize: 12, flexShrink: 0,
                  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', cursor: 'pointer',
                }}
              >
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
            ) : (
              <span style={{
                fontSize: 11, padding: '3px 8px', borderRadius: 12, flexShrink: 0,
                backgroundColor: u.role === 'admin' ? 'color-mix(in srgb, var(--surf2) 60%, var(--accent) 15%)' : 'var(--surf2)',
                border: '1px solid var(--border)',
                color: u.role === 'admin' ? 'var(--accent)' : 'var(--fg-dim)',
              }}>
                {ROLE_LABELS[u.role] ?? u.role}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border2)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
            Pending invites ({pendingInvites.length})
          </div>
          {pendingInvites.map((inv, i) => {
            const link = `${baseUrl}/signup?token=${inv.token}`
            return (
              <div key={inv.id} style={{ padding: '14px 20px', borderTop: i === 0 ? 'none' : '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{inv.email}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Expires {fmt(inv.expiresAt)}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button style={btnGhost} onClick={() => copyLink(link)}>Copy link</button>
                  {smtpConfigured && currentUserIsAdmin && (
                    <button
                      style={btnGhost}
                      onClick={() => startTransition(async () => {
                        await resendInviteEmail(inv.id)
                        setResentId(inv.id)
                        setTimeout(() => setResentId(null), 2000)
                      })}
                      disabled={pending}
                    >
                      {resentId === inv.id ? '✓ Sent' : 'Resend email'}
                    </button>
                  )}
                  {currentUserIsAdmin && (
                    <button
                      style={{ ...btnGhost, color: 'var(--err)', borderColor: 'color-mix(in srgb, var(--err) 40%, transparent)' }}
                      onClick={() => handleRevoke(inv.id)}
                      disabled={pending}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
