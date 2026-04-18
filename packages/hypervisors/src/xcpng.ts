import type {
  HypervisorBackupResult,
  HypervisorTestResult,
  XCPNGBackupOptions,
  XCPNGConfig,
  XCPNGTarget,
} from './types'

// Stub — implemented in V2 via Xen Orchestra API (xo-server)
export class XCPNGHypervisorDriver {
  constructor(private readonly _config: XCPNGConfig) {}

  async test(): Promise<HypervisorTestResult> {
    return { ok: false, message: 'XCP-ng driver not yet implemented (V2)' }
  }

  async listTargets(): Promise<XCPNGTarget[]> {
    return []
  }

  async backupVM(_opts: XCPNGBackupOptions): Promise<HypervisorBackupResult> {
    throw new Error('XCP-ng backup driver is not yet implemented (V2)')
  }
}
