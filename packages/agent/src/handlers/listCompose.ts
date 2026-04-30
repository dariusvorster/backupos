import { readFile } from 'fs/promises'
import { dirname, isAbsolute, resolve as resolvePath } from 'path'
import yaml from 'js-yaml'
import { listComposeContainers } from '../docker-client'
import type { ComposeProjectListing, ComposeServiceListing, ComposeServiceVolume } from '@backupos/agent-protocol'

interface ParsedComposeService {
  env_file?: string | string[]
}
interface ParsedCompose {
  services?: Record<string, ParsedComposeService>
}

/**
 * Reads the compose file and returns a map of serviceName → resolved env_file paths.
 * Returns empty map on any failure (compose file unreadable, YAML invalid).
 */
async function discoverEnvFilesPerService(composeFilePath: string): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>()
  try {
    const content = await readFile(composeFilePath, 'utf8')
    const parsed = yaml.load(content) as ParsedCompose | null
    if (!parsed || typeof parsed !== 'object' || !parsed.services) return result

    const baseDir = dirname(composeFilePath)
    for (const [svcName, svcCfg] of Object.entries(parsed.services)) {
      if (!svcCfg.env_file) continue
      const raw = Array.isArray(svcCfg.env_file) ? svcCfg.env_file : [svcCfg.env_file]
      const resolved = raw.map(p => isAbsolute(p) ? p : resolvePath(baseDir, p))
      result.set(svcName, resolved)
    }
  } catch {
    // Failed to read or parse compose file — return empty map silently
  }
  return result
}

function defaultQuiescence(image: string): { quiescence: string; apphookType?: string } {
  const img = image.toLowerCase()
  if (/postgres|postgis/.test(img)) return { quiescence: 'apphook', apphookType: 'postgres' }
  if (/mysql|mariadb/.test(img))    return { quiescence: 'apphook', apphookType: 'mysql' }
  if (/^redis/.test(img))           return { quiescence: 'apphook', apphookType: 'redis' }
  if (/nginx|caddy|traefik|plex|jellyfin|emby/.test(img)) return { quiescence: 'none' }
  return { quiescence: 'stop' }
}

export async function handleListCompose(projectName: string): Promise<ComposeProjectListing> {
  const containers = await listComposeContainers(projectName)
  if (containers.length === 0) {
    throw new Error(`No containers found for project '${projectName}'. Is the project name correct and is Docker accessible?`)
  }

  const composeFilePath = containers[0]?.Labels['com.docker.compose.project.config_files'] ?? undefined

  // The label can be comma-separated for multi-file compose projects. Take the first.
  const primaryComposeFile = composeFilePath?.split(',')[0]?.trim()
  const envFilesPerService = primaryComposeFile
    ? await discoverEnvFilesPerService(primaryComposeFile)
    : new Map<string, string[]>()

  const services: (ComposeServiceListing & { defaultQuiescence?: string; defaultApphookType?: string })[] =
    containers.map(c => {
      const serviceName = c.Labels['com.docker.compose.service'] ?? c.Names[0]?.replace(/^\//, '') ?? 'unknown'
      const volumes: ComposeServiceVolume[] = c.Mounts
        .filter(m => m.Type === 'volume')
        .map(m => ({ type: 'volume' as const, name: m.Name, target: m.Destination }))
      const binds: string[] = c.Mounts
        .filter(m => m.Type === 'bind')
        .map(m => m.Source)
      const dq = defaultQuiescence(c.Image)

      return {
        name: serviceName,
        image: c.Image,
        containerStatus: c.Status,
        volumes,
        binds,
        envFiles: envFilesPerService.get(serviceName) ?? [],
        networks: Object.keys(c.NetworkSettings?.Networks ?? {}),
        labels: c.Labels,
        defaultQuiescence: dq.quiescence,
        defaultApphookType: dq.apphookType,
      }
    })

  return { name: projectName, composeFilePath, services }
}
