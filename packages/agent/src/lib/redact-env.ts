/**
 * Pattern matchers for env keys whose VALUES should be redacted.
 * Matches the key name (case-insensitive) — e.g. PASSWORD, DB_PASS, AUTH_TOKEN, ApiKey.
 */
const SECRET_KEY_RE = /(password|secret|token|apikey|api_key|auth|credential|private_key|cert|encryption_key)/i

const REDACTION = '***REDACTED***'

/**
 * Redacts an env-file's secret values while preserving file structure
 * (comments, blank lines, formatting). Each `KEY=VALUE` line whose KEY
 * matches the secret regex has VALUE replaced with REDACTION. Lines
 * that aren't valid env declarations are kept verbatim.
 */
export function redactEnvFile(content: string): string {
  const lines = content.split('\n')
  return lines.map(rawLine => {
    const line = rawLine
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return line

    const eq = line.indexOf('=')
    if (eq === -1) return line

    const before = line.slice(0, eq)
    const key = before.replace(/^export\s+/, '').trim()

    if (SECRET_KEY_RE.test(key)) {
      return `${before}=${REDACTION}`
    }
    return line
  }).join('\n')
}
