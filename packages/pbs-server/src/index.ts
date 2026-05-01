// @backupos/pbs-server
// HTTPS entry + per-connection HTTP/2 servers for the PBS backup protocol.

export { startPbsServer, stopPbsServer } from './server'
export type {
  StartPbsServerOptions,
  PbsServerHandle,
  DatastoreLookup,
  SessionStore,
} from './server'

export {
  ensureSelfSignedCert,
  generateSelfSignedCert,
  loadCert,
  computeCertFingerprint,
} from './cert'
export type { CertPaths, CertMaterial } from './cert'

export { validatePbsAuth } from './auth'
export type { AuthLookup, AuthLookupResult, PbsTokenIdentity, ValidateResult } from './auth'

export { parseUpgradeParams } from './upgrade-params'
export type { UpgradeParams, UpgradeParamsResult } from './upgrade-params'
