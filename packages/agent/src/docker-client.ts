import * as http from 'http'

interface DockerOpts {
  socketPath?: string
  host?: string
  port?: number
}

function getOpts(): DockerOpts {
  const h = process.env['DOCKER_HOST'] ?? 'unix:///var/run/docker.sock'
  if (h.startsWith('unix://')) return { socketPath: h.slice('unix://'.length) }
  if (h.startsWith('tcp://')) {
    const u = new URL(h)
    return { host: u.hostname, port: parseInt(u.port || '2375') }
  }
  throw new Error(`Unsupported DOCKER_HOST: ${h}`)
}

function dockerReq(method: string, path: string, body?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const opts = getOpts()
    const payload = body ? JSON.stringify(body) : undefined
    const timer = setTimeout(() => reject(new Error(`Docker ${method} ${path} timeout`)), 30_000)

    const reqOpts: http.RequestOptions = {
      method, path,
      ...opts,
      headers: payload
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        : {},
    }

    const req = http.request(reqOpts, res => {
      let data = ''
      res.on('data', (c: string) => { data += c })
      res.on('end', () => {
        clearTimeout(timer)
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)) } catch { resolve(data) }
        } else {
          reject(new Error(`Docker ${method} ${path} → HTTP ${res.statusCode ?? '?'}: ${data}`))
        }
      })
    })
    req.on('error', e => { clearTimeout(timer); reject(e) })
    if (payload) req.write(payload)
    req.end()
  })
}

export interface DockerMount {
  Type: 'volume' | 'bind'
  Name?: string
  Source: string
  Destination: string
}

export interface DockerContainer {
  Id: string
  Names: string[]
  Image: string
  Status: string
  Labels: Record<string, string>
  Mounts: DockerMount[]
  NetworkSettings: { Networks: Record<string, unknown> }
}

export interface DockerContainerInspect {
  State: {
    Status: string
    Health?: { Status: string }
  }
}

export async function dockerPing(): Promise<boolean> {
  try { await dockerReq('GET', '/v1.41/_ping'); return true } catch { return false }
}

export async function listComposeContainers(projectName: string): Promise<DockerContainer[]> {
  const f = encodeURIComponent(JSON.stringify({ label: [`com.docker.compose.project=${projectName}`] }))
  return dockerReq('GET', `/v1.41/containers/json?filters=${f}&all=true`) as Promise<DockerContainer[]>
}

export async function pauseContainer(id: string): Promise<void> {
  await dockerReq('POST', `/v1.41/containers/${id}/pause`)
}

export async function unpauseContainer(id: string): Promise<void> {
  await dockerReq('POST', `/v1.41/containers/${id}/unpause`)
}

export async function stopContainer(id: string, timeoutSec = 10): Promise<void> {
  await dockerReq('POST', `/v1.41/containers/${id}/stop?t=${timeoutSec}`)
}

export async function startContainer(id: string): Promise<void> {
  await dockerReq('POST', `/v1.41/containers/${id}/start`)
}

export async function inspectContainer(id: string): Promise<DockerContainerInspect> {
  return dockerReq('GET', `/v1.41/containers/${id}/json`) as Promise<DockerContainerInspect>
}

export async function waitForRunning(id: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const info = await inspectContainer(id)
    if (info.State.Status === 'running') return
    await new Promise(r => setTimeout(r, 1_000))
  }
  throw new Error(`Container ${id} did not reach 'running' within ${timeoutMs}ms`)
}
