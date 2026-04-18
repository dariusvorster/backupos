export * from './types'
export { ProxmoxHypervisorDriver } from './proxmox'
export { XCPNGHypervisorDriver }   from './xcpng'
export { VMwareHypervisorDriver }  from './vmware'

import { ProxmoxHypervisorDriver } from './proxmox'
import { XCPNGHypervisorDriver }   from './xcpng'
import { VMwareHypervisorDriver }  from './vmware'

export const HYPERVISOR_DRIVERS = {
  proxmox: ProxmoxHypervisorDriver,
  xcpng:   XCPNGHypervisorDriver,
  vmware:  VMwareHypervisorDriver,
} as const

export type HypervisorType = keyof typeof HYPERVISOR_DRIVERS
