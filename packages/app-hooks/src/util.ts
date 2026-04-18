import { spawn } from 'child_process'
import { createWriteStream } from 'fs'
import { createGzip } from 'zlib'
import { unlink } from 'fs/promises'

// Runs a command and pipes stdout through gzip to destPath.
// Never uses shell — args must be a pre-built array.
export function runAndGzip(
  args: string[],
  destPath: string,
  env?: Record<string, string>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const [bin, ...rest] = args as [string, ...string[]]
    const proc = spawn(bin, rest, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const gzip   = createGzip()
    const output = createWriteStream(destPath)

    proc.stdout.pipe(gzip).pipe(output)

    const stderrChunks: Buffer[] = []
    proc.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

    output.on('finish', resolve)
    output.on('error', reject)
    gzip.on('error', reject)

    proc.on('close', (code) => {
      if (code !== 0) {
        const msg = Buffer.concat(stderrChunks).toString('utf8').trim()
        reject(new Error(`${bin} exited ${code}: ${msg}`))
      }
    })

    proc.on('error', reject)
  })
}

export async function removeSilent(path: string): Promise<void> {
  await unlink(path).catch(() => undefined)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
