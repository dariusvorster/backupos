// @backupos/pbs-server
// HTTP/2 server implementing the Proxmox Backup Server protocol.
//
// V1 milestone 3a: listener boots, /api2/json/version answers, no auth.
// Subsequent milestones add: token auth (M3b), backup endpoints (M4),
// restore endpoints (M5), GC/retention (M6), UI (M7).

export { startPbsServer, stopPbsServer } from './server'
export type { StartPbsServerOptions, PbsServerHandle } from './server'

export {
  ensureSelfSignedCert,
  generateSelfSignedCert,
  loadCert,
  computeCertFingerprint,
} from './cert'
export type { CertPaths, CertMaterial } from './cert'

export { validatePbsAuth } from './auth'
export type { AuthLookup, AuthLookupResult, PbsTokenIdentity, ValidateResult } from './auth'
