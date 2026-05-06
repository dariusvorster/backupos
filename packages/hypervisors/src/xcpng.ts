import type { HypervisorTestResult, XCPNGConfig, XCPNGTarget } from './types'
import { loginWithPassword, logout, vmGetAllRecords, poolGetAllRecords, hostGetAllRecords } from './xcpng-xmlrpc'

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
      const [vmRecords, poolRecords, hostRecords] = await Promise.all([
        vmGetAllRecords(poolMasterUrl, session, verifySsl),
        poolGetAllRecords(poolMasterUrl, session, verifySsl),
        hostGetAllRecords(poolMasterUrl, session, verifySsl),
      ])

      // Use the first pool's uuid as poolUuid for all VMs (single pool per master)
      const poolEntries = Object.values(poolRecords)
      const poolUuid = poolEntries[0]?.uuid as string ?? ''

      // Map host OpaqueRef → name_label for resolving VM.resident_on
      // Keys are OpaqueRefs (the outer keys from XAPI get_all_records), not UUIDs.
      // VM.resident_on holds an OpaqueRef, so we key by OpaqueRef here.
      const hostNameByRef = new Map<string, string>()
      for (const [opaqueRef, host] of Object.entries(hostRecords)) {
        if (host.name_label) {
          hostNameByRef.set(opaqueRef, host.name_label)
        }
      }

      const targets: XCPNGTarget[] = []
      for (const vm of Object.values(vmRecords)) {
        if (vm.is_a_template || vm.is_control_domain) continue

        const residentRef = vm.resident_on && vm.resident_on !== 'OpaqueRef:NULL'
          ? (vm.resident_on as string)
          : null

        const node = residentRef ? (hostNameByRef.get(residentRef) ?? '') : ''

        // hostUuid needed for Phase 2 host-targeted XAPI calls; look up from host record
        const hostUuid = residentRef
          ? ((hostRecords[residentRef]?.uuid as string | undefined) ?? null)
          : null

        targets.push({
          uuid:         vm.uuid as string,
          name:         vm.name_label as string,
          node,
          status:       normaliseStatus(vm.power_state as string),
          hostUuid,
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

function normaliseStatus(s: string): 'running' | 'stopped' | 'suspended' | 'paused' {
  const lower = s.toLowerCase()
  if (lower === 'running')   return 'running'
  if (lower === 'suspended') return 'suspended'
  if (lower === 'paused')    return 'paused'
  // 'halted' and any unknown XAPI value collapse to 'stopped'
  return 'stopped'
}
