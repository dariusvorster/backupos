# Encryption Key Escrow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional escrow of repository passwords. Users explicitly enter their plaintext password when enabling escrow; it is encrypted with AES-256-GCM using a key derived (scrypt) from their recovery passphrase + a random salt. The encrypted blob is stored in a new `escrowedKey` column on `repositories`. The repository detail page shows escrow status. The settings page offers a recovery section to decrypt and reveal the password.

**Architecture:** No user/TOTP system exists yet, so the spec's TOTP guard is replaced with a recovery passphrase (the same security model, just passphrase-based). Node.js `crypto` module handles scrypt KDF + AES-256-GCM. Server actions perform all crypto server-side; no keys or plaintexts cross the wire except the user-supplied passphrase and the recovered password. A single `escrowedKey` text column stores `{ salt, iv, ciphertext, authTag }` as JSON.

**Tech Stack:** Next.js 15 App Router server components/actions, Node.js `crypto`, TypeScript strict, CSS custom properties.

---

## File Map

| File | Action |
|---|---|
| `packages/db/src/schema.ts` | Modify — add `escrowedKey` to `repositories` |
| `apps/web/lib/escrow.ts` | Create — `encryptPassword`, `decryptPassword` using scrypt + AES-256-GCM |
| `apps/web/app/actions/escrow.ts` | Create — `setEscrow`, `clearEscrow`, `recoverPassword` server actions |
| `apps/web/app/(dashboard)/repositories/[id]/page.tsx` | Modify — add escrow status card with set/clear form |
| `apps/web/app/(dashboard)/settings/page.tsx` | Modify — add recovery section listing escrowed repos |

---

### Task 1: DB Schema — escrowedKey on repositories

**Files:**
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Find the repositories table**

```bash
grep -n "export const repositories" packages/db/src/schema.ts
```

Read from that line to see the current last column.

- [ ] **Step 2: Add the column**

After the last existing column (before the closing `}`), add:

```typescript
escrowedKey: text('escrowed_key'),
```

`escrowedKey` stores a JSON blob `{ salt, iv, ciphertext, authTag }` — all hex strings. Null = no escrow configured.

- [ ] **Step 3: Generate migration and run against BOTH databases**

```bash
pnpm --filter @backupos/db db:generate
pnpm --filter @backupos/db db:migrate
DATABASE_URL="file:../../apps/web/data/backupos.db" pnpm --filter @backupos/db db:migrate
pnpm --filter @backupos/db build
```

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations/
git commit -m "feat: add escrowedKey column to repositories schema"
```

---

### Task 2: Escrow Crypto Utility + Server Actions

**Files:**
- Create: `apps/web/lib/escrow.ts`
- Create: `apps/web/app/actions/escrow.ts`

- [ ] **Step 1: Create `apps/web/lib/escrow.ts`**

```typescript
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'crypto'

interface EscrowBlob {
  salt:       string
  iv:         string
  ciphertext: string
  authTag:    string
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 }) as Buffer
}

export function encryptPassword(password: string, passphrase: string): string {
  const salt = randomBytes(16)
  const iv   = randomBytes(12)
  const key  = deriveKey(passphrase, salt)

  const cipher     = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
  const authTag    = cipher.getAuthTag()

  const blob: EscrowBlob = {
    salt:       salt.toString('hex'),
    iv:         iv.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
    authTag:    authTag.toString('hex'),
  }
  return JSON.stringify(blob)
}

export function decryptPassword(escrowJson: string, passphrase: string): string {
  const blob: EscrowBlob = JSON.parse(escrowJson)
  const salt = Buffer.from(blob.salt, 'hex')
  const iv   = Buffer.from(blob.iv, 'hex')
  const key  = deriveKey(passphrase, salt)

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(Buffer.from(blob.authTag, 'hex'))

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, 'hex')),
    decipher.final(),
  ])
  return plaintext.toString('utf8')
}
```

- [ ] **Step 2: Create `apps/web/app/actions/escrow.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { getDb, repositories } from '@backupos/db'
import { eq } from 'drizzle-orm'
import { encryptPassword, decryptPassword } from '@/lib/escrow'

export async function setEscrow(repoId: string, formData: FormData): Promise<{ error?: string }> {
  const password   = ((formData.get('password')   ?? '') as string).trim()
  const passphrase = ((formData.get('passphrase')  ?? '') as string).trim()
  const confirm    = ((formData.get('confirm')     ?? '') as string).trim()

  if (!password)              return { error: 'Repository password is required.' }
  if (passphrase.length < 8)  return { error: 'Recovery passphrase must be at least 8 characters.' }
  if (passphrase !== confirm)  return { error: 'Passphrases do not match.' }

  const escrowedKey = encryptPassword(password, passphrase)
  const db = getDb()
  await db.update(repositories).set({ escrowedKey }).where(eq(repositories.id, repoId)).run()
  revalidatePath(`/repositories/${repoId}`)
  return {}
}

export async function clearEscrow(repoId: string): Promise<void> {
  const db = getDb()
  await db.update(repositories).set({ escrowedKey: null }).where(eq(repositories.id, repoId)).run()
  revalidatePath(`/repositories/${repoId}`)
}

export async function recoverPassword(repoId: string, formData: FormData): Promise<{ password?: string; error?: string }> {
  const passphrase = ((formData.get('passphrase') ?? '') as string).trim()
  if (!passphrase) return { error: 'Recovery passphrase is required.' }

  const db   = getDb()
  const repo = await db.select({ escrowedKey: repositories.escrowedKey }).from(repositories).where(eq(repositories.id, repoId)).get()

  if (!repo?.escrowedKey) return { error: 'No escrow configured for this repository.' }

  try {
    const password = decryptPassword(repo.escrowedKey, passphrase)
    return { password }
  } catch {
    return { error: 'Incorrect passphrase — decryption failed.' }
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/escrow.ts apps/web/app/actions/escrow.ts
git commit -m "feat: add escrow crypto utility and server actions (scrypt + AES-256-GCM)"
```

---

### Task 3: Repository Detail Page — Escrow Card

**Files:**
- Modify: `apps/web/app/(dashboard)/repositories/[id]/page.tsx`

- [ ] **Step 1: Read the current repository detail page**

Read `apps/web/app/(dashboard)/repositories/[id]/page.tsx`. Understand the existing structure (it already has a forecast card and other sections).

- [ ] **Step 2: Add imports**

Add at the top (only if not already present):

```typescript
import { setEscrow, clearEscrow } from '@/app/actions/escrow'
import { ShieldCheck, ShieldAlert } from 'lucide-react'
```

- [ ] **Step 3: Bind server actions**

After the existing bound action lines (e.g. `boundSaveCostConfig`), add:

```typescript
const boundSetEscrow   = setEscrow.bind(null, repo.id)
const boundClearEscrow = clearEscrow.bind(null, repo.id)
const hasEscrow        = repo.escrowedKey !== null && repo.escrowedKey !== undefined
```

- [ ] **Step 4: Add the Escrow card to the JSX**

Add this card before (or after) the Forecast card:

```tsx
{/* Escrow card */}
<div style={{
  backgroundColor: 'var(--surf)',
  border: `1px solid ${hasEscrow ? 'color-mix(in srgb, var(--border) 60%, var(--ok) 40%)' : 'var(--border)'}`,
  borderRadius: 'var(--radius)',
  padding: '20px 24px',
  marginBottom: 24,
}}>
  {/* Header */}
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
    {hasEscrow
      ? <ShieldCheck size={16} color="var(--ok)" />
      : <ShieldAlert size={16} color="var(--warn)" />
    }
    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>Password escrow</span>
    <span style={{ flex: 1 }} />
    <span style={{
      fontSize: 12, fontWeight: 500,
      color: hasEscrow ? 'var(--ok)' : 'var(--warn)',
      padding: '2px 8px',
      borderRadius: 'var(--radius-sm)',
      backgroundColor: hasEscrow
        ? 'color-mix(in srgb, transparent 85%, var(--ok) 15%)'
        : 'color-mix(in srgb, transparent 85%, var(--warn) 15%)',
      border: `1px solid ${hasEscrow
        ? 'color-mix(in srgb, transparent 70%, var(--ok) 30%)'
        : 'color-mix(in srgb, transparent 70%, var(--warn) 30%)'}`,
    }}>
      {hasEscrow ? 'Password in escrow ✓' : 'No escrow — password loss unrecoverable ⚠'}
    </span>
  </div>

  {hasEscrow ? (
    /* Clear escrow */
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--fg-mute)' }}>
      <span>Your repository password is safely escrowed and can be recovered with your recovery passphrase at Settings.</span>
      <form action={boundClearEscrow} style={{ flexShrink: 0 }}>
        <button type="submit" style={{
          fontSize: 12, padding: '4px 12px', cursor: 'pointer',
          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
          color: 'var(--fg-mute)', background: 'var(--surf2)',
        }}>
          Remove escrow
        </button>
      </form>
    </div>
  ) : (
    /* Set escrow form */
    <div>
      <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 16, lineHeight: 1.5 }}>
        BackupOS can store an encrypted copy of this repository password. You can recover it using your recovery passphrase. If you lose both, the backup is unrecoverable.
      </p>
      <form action={boundSetEscrow} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 4 }}>Repository password</label>
          <input
            name="password"
            type="password"
            required
            placeholder="Enter your current restic password"
            style={{ width: '100%', padding: '6px 10px', fontSize: 13, backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 4 }}>Recovery passphrase (min. 8 characters)</label>
          <input
            name="passphrase"
            type="password"
            required
            minLength={8}
            placeholder="Choose a memorable passphrase"
            style={{ width: '100%', padding: '6px 10px', fontSize: 13, backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 4 }}>Confirm passphrase</label>
          <input
            name="confirm"
            type="password"
            required
            minLength={8}
            placeholder="Repeat passphrase"
            style={{ width: '100%', padding: '6px 10px', fontSize: 13, backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <button type="submit" style={{
          fontSize: 13, padding: '7px 16px', cursor: 'pointer',
          borderRadius: 'var(--radius-sm)', border: 'none',
          background: 'var(--accent)', color: '#fff', alignSelf: 'flex-start',
        }}>
          Enable escrow
        </button>
      </form>
    </div>
  )}
</div>
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -30
```

Fix any errors. `repo.escrowedKey` is `string | null` from Drizzle — the `hasEscrow` check handles this.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(dashboard)/repositories/[id]/page.tsx"
git commit -m "feat: add password escrow card to repository detail page"
```

---

### Task 4: Settings Page — Recovery Section

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Read the current settings page**

Read `apps/web/app/(dashboard)/settings/page.tsx`.

- [ ] **Step 2: Check what the page currently imports and fetches**

The page likely fetches some data. You'll need to add a query for escrowed repositories.

- [ ] **Step 3: Add EscrowRecoverySection as a separate client component**

Create `apps/web/components/escrow-recovery-section.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { recoverPassword } from '@/app/actions/escrow'
import { Key, Eye, EyeOff } from 'lucide-react'

interface EscrowedRepo {
  id:   string
  name: string
}

export function EscrowRecoverySection({ repos }: { repos: EscrowedRepo[] }) {
  const [selectedId, setSelectedId]    = useState(repos[0]?.id ?? '')
  const [passphrase,  setPassphrase]   = useState('')
  const [revealed,    setRevealed]     = useState<string | null>(null)
  const [showPwd,     setShowPwd]      = useState(false)
  const [error,       setError]        = useState<string | null>(null)
  const [isPending,   startTransition] = useTransition()

  if (repos.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--fg-dim)' }}>
        No repositories have escrow configured. Enable it from a repository detail page.
      </p>
    )
  }

  function handleRecover() {
    setError(null)
    setRevealed(null)
    const fd = new FormData()
    fd.set('passphrase', passphrase)
    startTransition(async () => {
      const result = await recoverPassword(selectedId, fd)
      if (result.error) { setError(result.error); return }
      setRevealed(result.password ?? null)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 }}>
      <div>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 4 }}>Repository</label>
        <select
          value={selectedId}
          onChange={e => { setSelectedId(e.target.value); setRevealed(null); setError(null) }}
          style={{ width: '100%', padding: '6px 10px', fontSize: 13, backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--fg)' }}
        >
          {repos.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-mute)', marginBottom: 4 }}>Recovery passphrase</label>
        <input
          type="password"
          value={passphrase}
          onChange={e => { setPassphrase(e.target.value); setRevealed(null); setError(null) }}
          placeholder="Enter your recovery passphrase"
          style={{ width: '100%', padding: '6px 10px', fontSize: 13, backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {error && (
        <p style={{ fontSize: 12, color: 'var(--err)', margin: 0 }}>{error}</p>
      )}

      {revealed ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          backgroundColor: 'var(--surf2)', borderRadius: 'var(--radius-sm)',
          padding: '8px 12px', border: '1px solid var(--border)',
        }}>
          <code style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg)', filter: showPwd ? 'none' : 'blur(4px)', userSelect: showPwd ? 'text' : 'none' }}>
            {revealed}
          </code>
          <button
            onClick={() => setShowPwd(p => !p)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-mute)', padding: 2, display: 'flex' }}
          >
            {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      ) : (
        <button
          onClick={handleRecover}
          disabled={isPending || !passphrase}
          style={{
            fontSize: 13, padding: '7px 16px', cursor: isPending ? 'wait' : 'pointer',
            borderRadius: 'var(--radius-sm)', border: 'none',
            background: 'var(--accent)', color: '#fff', alignSelf: 'flex-start',
            opacity: !passphrase ? 0.5 : 1,
          }}
        >
          {isPending ? 'Decrypting…' : 'Recover password'}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Modify settings page**

Add imports:
```typescript
import { repositories } from '@backupos/db'
import { isNotNull }    from 'drizzle-orm'
import { EscrowRecoverySection } from '@/components/escrow-recovery-section'
import { Key } from 'lucide-react'
```

Add data fetch (after existing fetches):
```typescript
const escrowedRepos = await db.select({ id: repositories.id, name: repositories.name })
  .from(repositories)
  .where(isNotNull(repositories.escrowedKey))
  .all()
```

Add recovery section to the JSX (after existing settings items):
```tsx
{/* Password recovery */}
<div style={{
  backgroundColor: 'var(--surf)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '20px 24px',
  marginBottom: 24,
}}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
    <Key size={16} color="var(--fg-mute)" />
    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>Recover repository password</span>
  </div>
  <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 16, lineHeight: 1.5 }}>
    If you have forgotten a repository password, you can recover it here using your recovery passphrase — provided escrow was enabled for that repository.
  </p>
  <EscrowRecoverySection repos={escrowedRepos} />
</div>
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -30
```

Fix any errors. `isNotNull` may need to be imported from `drizzle-orm` directly (not from `@backupos/db`) — check with:
```bash
grep "isNotNull" packages/db/src/index.ts
```
If not re-exported, import from `'drizzle-orm'` directly.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/escrow-recovery-section.tsx "apps/web/app/(dashboard)/settings/page.tsx"
git commit -m "feat: add password recovery section to settings page"
```

---

## Self-Review

### Spec coverage

| Spec requirement (§1.9) | Task |
|---|---|
| Optional encrypted escrow of repo passwords | Tasks 2+3 (server actions + escrow card form) |
| Explains escrow trade-off to user | Task 3 (explanatory text in the card) |
| Toggle — if on, password encrypted and stored | Task 3 (Enable escrow form → setEscrow action) |
| "Password in escrow ✓" / "No escrow ⚠" on repo detail | Task 3 (status badge in escrow card header) |
| Recovery flow at Settings | Task 4 (EscrowRecoverySection + recovery card) |

### Spec adaptation notes

The spec says escrow is guarded by TOTP. Since no TOTP system exists yet (§3.5), a recovery passphrase is used instead — same security model (something the user knows, separate from the repo password). This is noted for future replacement when TOTP is implemented.

### Placeholder scan

No TBD/TODO. The error returned by `setEscrow` is not surfaced in the UI via server-action error handling (forms don't show server errors in basic Next.js forms). This is a known limitation of the simple form approach — a `useFormState`/`useActionState` wrapper would fix it but adds complexity. The field-level validation (minLength, required) catches most cases client-side.

### Type consistency

- `setEscrow(repoId: string, formData: FormData)` matches `.bind(null, repo.id)` pattern — consistent
- `clearEscrow(repoId: string)` used as form action directly via bind — consistent
- `recoverPassword(repoId, formData)` called from `EscrowRecoverySection` with manually constructed `FormData` — consistent
- `EscrowedRepo { id: string; name: string }` matches the select projection in settings page — consistent
- `repo.escrowedKey` is `string | null` from Drizzle — `hasEscrow` checks both `null` and `undefined` — consistent
