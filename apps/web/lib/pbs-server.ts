import { readFile } from 'node:fs/promises'
import { X509Certificate } from 'node:crypto'
import { getServerPublicUrl } from './server-url'

export interface PbsServerInfo {
  /** Hostname or IP that PVE will use to reach backupos-pbs. */
  host: string
  /** Port backupos-pbs is bound to. */
  port: number
  /** SHA-256 fingerprint of the PBS TLS cert, colon-hex uppercase. */
  fingerprint: string
}

const DEFAULT_CERT_PATH = '/var/lib/backupos/pbs/cert.pem'

/**
 * Returns connection info for the backupos-pbs service.
 *
 * Port: BACKUPOS_PBS_BIND env var (format "host:port") → 8007 fallback
 * Host: BACKUPOS_PBS_HOST env var → dashboard URL hostname → 'localhost'
 * Fingerprint: SHA-256 of the PBS TLS cert at certPath
 */
export async function getPbsServerInfo(opts: {
  requestUrl?: string
  certPath?: string
} = {}): Promise<PbsServerInfo> {
  const certPath = opts.certPath ?? DEFAULT_CERT_PATH

  // Port
  const bind = process.env['BACKUPOS_PBS_BIND']
  let port = 8007
  if (bind && bind.includes(':')) {
    const parsed = parseInt(bind.split(':').pop() ?? '', 10)
    if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) port = parsed
  }

  // Host
  let host = process.env['BACKUPOS_PBS_HOST'] ?? ''
  if (!host) {
    const { url } = await getServerPublicUrl(opts.requestUrl)
    try {
      host = new URL(url).hostname || 'localhost'
    } catch {
      host = 'localhost'
    }
  }

  // Fingerprint — X509Certificate.fingerprint256 is already colon-hex uppercase
  const certPem = await readFile(certPath, 'utf8')
  const cert = new X509Certificate(certPem)
  const fingerprint = cert.fingerprint256

  return { host, port, fingerprint }
}
