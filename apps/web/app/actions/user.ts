'use server'

import { revalidatePath }    from 'next/cache'
import { getDb, user }       from '@backupos/db'
import { eq }                from '@backupos/db'
import { writeFile, mkdir }  from 'fs/promises'
import path                  from 'path'
import { auth }              from '@/lib/auth'
import { getCurrentUser, requireUserAction } from '@/lib/user'
import { headers }           from 'next/headers'

export async function updateProfile(formData: FormData): Promise<{ error?: string }> {
  const me = await getCurrentUser()
  if (!me) return { error: 'Not authenticated.' }

  const name          = ((formData.get('name')        ?? '') as string).trim()
  const displayName   = ((formData.get('displayName') ?? '') as string).trim()
  const emailNotify   = formData.get('emailNotify')   === 'on'
  const notifyAlerts  = formData.get('notifyAlerts')  === 'on'
  const notifyWeekly  = formData.get('notifyWeekly')  === 'on'
  const notifyUpdates = formData.get('notifyUpdates') === 'on'

  if (!name) return { error: 'Name is required.' }

  const db = getDb()
  await db.update(user).set({
    name,
    displayName:  displayName  || null,
    emailNotify,
    notifyAlerts,
    notifyWeekly,
    notifyUpdates,
    updatedAt: new Date(),
  }).where(eq(user.id, me.id)).run()

  revalidatePath('/settings/profile')
  return {}
}

export async function uploadAvatar(formData: FormData): Promise<{ error?: string }> {
  const me = await getCurrentUser()
  if (!me) return { error: 'Not authenticated.' }

  const file = formData.get('avatar') as File | null
  if (!file || file.size === 0) return { error: 'No file selected.' }
  if (file.size > 1_000_000)    return { error: 'File too large (max 1 MB).' }

  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    return { error: 'Only JPG, PNG, or WebP files are accepted.' }
  }

  const buf = Buffer.from(await file.arrayBuffer())
  if (buf.length < 12) return { error: 'File content does not match an accepted image type.' }
  const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF
  const isPng  = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47
  const isWebp = buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
               && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  if (!isJpeg && !isPng && !isWebp) {
    return { error: 'File content does not match an accepted image type.' }
  }

  const dir = path.join(process.cwd(), 'public', 'avatars')
  await mkdir(dir, { recursive: true })

  const filename = `${me.id}.${ext}`
  await writeFile(path.join(dir, filename), buf)

  const db = getDb()
  await db.update(user).set({ image: `/avatars/${filename}`, updatedAt: new Date() }).where(eq(user.id, me.id)).run()

  revalidatePath('/settings/profile')
  return {}
}

export async function removeAvatar(): Promise<void> {
  const me = await getCurrentUser()
  if (!me) return
  const db = getDb()
  await db.update(user).set({ image: null, updatedAt: new Date() }).where(eq(user.id, me.id)).run()
  revalidatePath('/settings/profile')
}

export async function changePassword(formData: FormData): Promise<{ error?: string }> {
  await requireUserAction()

  const currentPassword = (formData.get('currentPassword') ?? '') as string
  const newPassword     = (formData.get('newPassword')     ?? '') as string
  const confirm         = (formData.get('confirm')         ?? '') as string

  if (!currentPassword)        return { error: 'Current password is required.' }
  if (newPassword.length < 8)  return { error: 'New password must be at least 8 characters.' }
  if (newPassword !== confirm)  return { error: 'Passwords do not match.' }

  try {
    await auth.api.changePassword({
      body:    { currentPassword, newPassword, revokeOtherSessions: false },
      headers: await headers(),
    })
    return {}
  } catch {
    return { error: 'Incorrect current password.' }
  }
}
