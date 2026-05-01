// GET /api2/json/version handler.
//
// PBS response shape (verified against real responses in
// https://forum.proxmox.com/threads/version-3-2-2-api-access-via-cli.146516/):
//
//   {
//     "data": {
//       "version": "4.0.0",
//       "release": "1",
//       "repoid":  "backupos"
//     }
//   }
//
// PVE uses this endpoint as a liveness probe and to detect the protocol
// version. We report a stable widely-supported PBS version string so PVE
// accepts us; the actual implementation surfaces in subsequent endpoints.
//
// Clean-room.

export interface VersionInput {
  version: string
  release: string
}

export interface VersionResponse {
  data: {
    version: string
    release: string
    repoid:  string
  }
}

export function handleVersion(input: VersionInput): VersionResponse {
  return {
    data: {
      version: input.version,
      release: input.release,
      repoid:  'backupos',
    },
  }
}
