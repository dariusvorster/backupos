// Self-signed TLS cert for the PBS protocol listener.
//
// PVE clients pin certificates by fingerprint, not CA chain — so a
// long-lived self-signed cert is correct here. We generate once at
// first boot, write to disk, and load it on every boot thereafter.
//
// Source: PVE PBS storage docs require a "fingerprint" parameter
// (https://pve.proxmox.com/wiki/Storage:_Proxmox_Backup_Server),
// confirming fingerprint-pinning rather than CA-validation.
//
// Clean-room. No PBS source code read.

import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, chmodSync } from 'fs'
import { dirname } from 'path'
import { X509Certificate } from 'crypto'

export interface CertPaths {
  certPath: string
  keyPath:  string
}

export interface CertMaterial {
  cert:        Buffer
  key:         Buffer
  /** Colon-separated uppercase hex SHA-256 fingerprint, e.g. `AB:CD:...` */
  fingerprint: string
}

const VALIDITY_DAYS = 3650 // 10 years
const COMMON_NAME = 'BackupOS PBS-compatible endpoint'

/**
 * Ensure a self-signed cert+key exist at the given paths. Generate them if
 * not. Returns the loaded material in either case. Idempotent.
 */
export function ensureSelfSignedCert(paths: CertPaths): CertMaterial {
  if (!existsSync(paths.certPath) || !existsSync(paths.keyPath)) {
    generateSelfSignedCert(paths)
  }
  return loadCert(paths)
}

/** Force re-generation. Overwrites existing cert/key. */
export function generateSelfSignedCert(paths: CertPaths): void {
  const certDir = dirname(paths.certPath)
  if (!existsSync(certDir)) {
    mkdirSync(certDir, { recursive: true, mode: 0o755 })
  }

  // openssl req: generate key + self-signed cert in one shot.
  // -nodes      = no key passphrase (server reads on every boot, can't prompt)
  // -newkey     = generate fresh RSA key
  // -keyout/out = where to write
  // -days       = validity period
  // -subj       = no interactive prompt for DN fields
  execFileSync('openssl', [
    'req',
    '-x509',
    '-nodes',
    '-newkey', 'rsa:4096',
    '-keyout', paths.keyPath,
    '-out',    paths.certPath,
    '-days',   String(VALIDITY_DAYS),
    '-subj',   `/CN=${COMMON_NAME}`,
    '-sha256',
  ], { stdio: 'pipe' })

  // Lock down the private key — group/world readable would let any process
  // on the box impersonate the BackupOS PBS endpoint.
  chmodSync(paths.keyPath, 0o600)
  chmodSync(paths.certPath, 0o644)
}

/** Load an existing cert+key from disk and compute its SHA-256 fingerprint. */
export function loadCert(paths: CertPaths): CertMaterial {
  const cert = readFileSync(paths.certPath)
  const key  = readFileSync(paths.keyPath)
  const fingerprint = computeCertFingerprint(cert)
  return { cert, key, fingerprint }
}

/** Compute the colon-separated uppercase hex SHA-256 fingerprint of a PEM cert. */
export function computeCertFingerprint(certPem: Buffer): string {
  const x509 = new X509Certificate(certPem)
  // Returns "AB:CD:..." (uppercase hex with colons), matching pvesm add pbs --fingerprint format.
  return x509.fingerprint256
}
