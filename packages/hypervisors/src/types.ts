// ── Shared ────────────────────────────────────────────────────────────────

export interface HypervisorBackupResult {
  taskId: string       // Proxmox UPID or XCP-ng task ref
  storagePath?: string // path to the backup file on the hypervisor host
  sizeBytes?: number
  duration: number     // seconds
}

export interface HypervisorTestResult {
  ok: boolean
  message?: string
}

// ── Proxmox ───────────────────────────────────────────────────────────────

export interface ProxmoxConfig {
  url: string          // https://pve.local:8006
  tokenId: string      // user@pam!backupos
  tokenSecret: string
  verifySsl?: boolean  // default true
}

export interface ProxmoxBackupOptions {
  node: string
  vmid: number
  type: 'qemu' | 'lxc'
  mode: 'snapshot' | 'suspend' | 'stop'
  includeMemory: boolean
  notesTemplate?: string
}

export interface ProxmoxTarget {
  vmid: number
  name: string
  node: string
  type: 'qemu' | 'lxc'
  status: 'running' | 'stopped' | 'paused'
  tags: string[]
}

export interface VMStatus {
  vmid: number
  status: string
  cpuUsage: number
  memUsage: number
}

// Raw Proxmox API shapes

export interface PveNode {
  node: string
  status: string
}

export interface PveVm {
  vmid: number
  name: string
  status: string
  tags?: string
}

export interface PveTaskStatus {
  status: 'running' | 'stopped'
  exitstatus?: string
}

// ── XCP-ng ────────────────────────────────────────────────────────────────

export interface XCPNGConfig {
  poolMasterUrl: string  // https://xcp-pool-master.local
  username: string
  password: string
  verifySsl?: boolean    // default true
  certFingerprint?: string
}

export interface XCPNGTarget {
  uuid: string
  nameLabel: string
  powerState: 'Running' | 'Halted' | 'Suspended' | 'Paused'
  hostUuid: string | null
  poolUuid: string
  isCbtCapable: boolean
}

export interface XCPNGBackupChainState {
  vdiUuid: string
  lastSnapshotUuid: string | null
  lastBitmapBase: string | null
  lastBackupAt: number | null
}

// ── VMware ────────────────────────────────────────────────────────────────

export interface VMwareConfig {
  vcenterUrl: string
  username: string
  password: string
  verifySsl?: boolean
}

export interface VMwareTarget {
  moRef: string
  name: string
  status: string
  datacenter: string
}
