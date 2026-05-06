import type { HypervisorTestResult, XCPNGConfig, XCPNGTarget } from './types'
import { loginWithPassword, logout, vmGetAllRecords, poolGetAllRecords } from './xcpng-xmlrpc'

export class XCPNGHypervisorDriver {
  constructor(private readonly config: XCPNGConfig) {}

  async test(): Promise<HypervisorTestResult> {
    const { poolMasterUrl, username, password, verifySsl = true } = this.config
    let session: string | null = null
    try {
      session = await loginWithPassword(poolMasterUrl, username, password, verifySsl)
      await poolGetAllRecords(poolMasterUrl, session, verifySsl)
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    } finally {
      if (session) await logout(poolMasterUrl, session)
    }
  }

  async listTargets(): Promise<XCPNGTarget[]> {
    const { poolMasterUrl, username, password, verifySsl = true } = this.config
    const session = await loginWithPassword(poolMasterUrl, username, password, verifySsl)
    try {
      const [vmRecords, poolRecords] = await Promise.all([
        vmGetAllRecords(poolMasterUrl, session, verifySsl),
        poolGetAllRecords(poolMasterUrl, session, verifySsl),
      ])

      // Use the first pool's uuid as poolUuid for all VMs (single pool per master)
      const poolEntries = Object.values(poolRecords)
      const poolUuid = poolEntries.length > 0 ? (poolEntries[0].uuid as string) : ''

      const targets: XCPNGTarget[] = []
      for (const vm of Object.values(vmRecords)) {
        if (vm.is_a_template || vm.is_control_domain) continue

        const powerState = normalisePowerState(vm.power_state as string)
        targets.push({
          uuid:         vm.uuid as string,
          nameLabel:    vm.name_label as string,
          powerState,
          hostUuid:     vm.resident_on && vm.resident_on !== 'OpaqueRef:NULL'
                          ? (vm.resident_on as string)
                          : null,
          poolUuid,
          isCbtCapable: false, // Phase 2 will detect CBT capability via VDI flags
        })
      }

      return targets
    } finally {
      await logout(poolMasterUrl, session)
    }
  }
}

function normalisePowerState(s: string): 'Running' | 'Halted' | 'Suspended' | 'Paused' {
  const lower = s.toLowerCase()
  if (lower === 'running')   return 'Running'
  if (lower === 'suspended') return 'Suspended'
  if (lower === 'paused')    return 'Paused'
  return 'Halted'
}
