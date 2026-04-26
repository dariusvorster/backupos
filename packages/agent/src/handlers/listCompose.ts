import { listComposeContainers } from '../docker-client'
import type { ComposeProjectListing, ComposeServiceListing, ComposeServiceVolume } from '@backupos/agent-protocol'

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
        envFiles: [],
        networks: Object.keys(c.NetworkSettings?.Networks ?? {}),
        labels: c.Labels,
        defaultQuiescence: dq.quiescence,
        defaultApphookType: dq.apphookType,
      }
    })

  return { name: projectName, composeFilePath, services }
}
