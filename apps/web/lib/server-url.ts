import { getInstanceSettings } from './settings'

export type ServerUrlSource = 'setting' | 'env' | 'request' | 'unknown'

export async function getServerPublicUrl(
  requestUrl?: string,
): Promise<{ url: string; source: ServerUrlSource }> {
  const settings = await getInstanceSettings()
  if (settings?.serverPublicUrl) return { url: settings.serverPublicUrl, source: 'setting' }
  if (process.env['BACKUPOS_PUBLIC_URL']) return { url: process.env['BACKUPOS_PUBLIC_URL'], source: 'env' }
  if (requestUrl) {
    const u = new URL(requestUrl)
    return { url: `${u.protocol}//${u.host}`, source: 'request' }
  }
  return { url: 'http://localhost:3093', source: 'unknown' }
}

export function toWebSocketUrl(httpUrl: string): string {
  const u = new URL(httpUrl)
  const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${wsProto}//${u.host}/ws/agent`
}
