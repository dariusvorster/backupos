// @backupos/pbs-server
// HTTP/2 server implementing the Proxmox Backup Server protocol.
//
// Milestone 0: skeleton only. startPbsServer is a no-op stub that will
// be wired in milestone 3.

export interface StartPbsServerOptions {
  port?: number
  storageRoot?: string
}

export function startPbsServer(_opts: StartPbsServerOptions = {}): void {
  // Stub — implemented in milestone 3.
}

export function stopPbsServer(): void {
  // Stub — implemented in milestone 3.
}
