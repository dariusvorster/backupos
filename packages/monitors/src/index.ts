export * from './types'
export { ProxmoxPBSMonitor } from './proxmox-pbs'
export { BorgMonitor }       from './borg'
export { DuplicatiMonitor }  from './duplicati'
export { VeeamMonitor }      from './veeam'
export { ResticRepoMonitor } from './restic-repo'

import type { BackupMonitorAdapter } from './types'
import { ProxmoxPBSMonitor } from './proxmox-pbs'
import { BorgMonitor }       from './borg'
import { DuplicatiMonitor }  from './duplicati'
import { VeeamMonitor }      from './veeam'
import { ResticRepoMonitor } from './restic-repo'

export const MONITOR_REGISTRY: Record<string, BackupMonitorAdapter> = {
  proxmox_pbs:  new ProxmoxPBSMonitor(),
  borg:         new BorgMonitor(),
  duplicati:    new DuplicatiMonitor(),
  veeam:        new VeeamMonitor(),
  restic_repo:  new ResticRepoMonitor(),
}
