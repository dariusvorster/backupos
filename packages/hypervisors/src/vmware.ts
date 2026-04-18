import type {
  HypervisorBackupResult,
  HypervisorTestResult,
  VMwareConfig,
  VMwareTarget,
} from './types'

// Stub — implemented in V2 via VMware vSphere API
export class VMwareHypervisorDriver {
  constructor(private readonly _config: VMwareConfig) {}

  async test(): Promise<HypervisorTestResult> {
    return { ok: false, message: 'VMware driver not yet implemented (V2)' }
  }

  async listTargets(): Promise<VMwareTarget[]> {
    return []
  }

  async backupVM(_moRef: string): Promise<HypervisorBackupResult> {
    throw new Error('VMware backup driver is not yet implemented (V2)')
  }
}
