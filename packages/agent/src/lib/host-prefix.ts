import { existsSync, statSync } from 'fs'

const DEFAULT_HOST_PREFIX = '/host'

/**
 * Resolves the host path prefix for this agent based on environment.
 * Returns '' if no prefix should be applied (host agent or explicit opt-out).
 * Returns a normalized prefix (no trailing slash) if prefix should be applied.
 *
 * Known limitation: container-agent backups produce snapshot paths beginning
 * with the prefix (e.g. /host/etc/...). The server sees these verbatim.
 * Stripping the prefix from snapshot metadata is a future concern (v0.3.0).
 */
export function resolveHostPrefix(): string {
  if ('BACKUPOS_HOST_PREFIX' in process.env) {
    const explicit = process.env['BACKUPOS_HOST_PREFIX']
    if (explicit === '' || explicit === undefined) return ''
    return explicit.replace(/\/+$/, '')
  }

  try {
    if (existsSync(DEFAULT_HOST_PREFIX) && statSync(`${DEFAULT_HOST_PREFIX}/etc`).isDirectory()) {
      return DEFAULT_HOST_PREFIX
    }
  } catch {
    // /host/etc doesn't exist — host agent
  }

  return ''
}

/**
 * Rewrites a single absolute path with the host prefix if applicable.
 * Idempotent: a path already prefixed is returned unchanged.
 */
export function applyHostPrefix(p: string, prefix: string): string {
  if (!prefix) return p
  if (!p.startsWith('/')) return p
  if (p === prefix || p.startsWith(`${prefix}/`)) return p
  return `${prefix}${p}`
}

/**
 * Applies prefix to an array of paths.
 */
export function applyHostPrefixAll(paths: string[], prefix: string): string[] {
  return paths.map(p => applyHostPrefix(p, prefix))
}
