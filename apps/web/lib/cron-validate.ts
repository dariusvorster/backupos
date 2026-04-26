import { parseExpression } from 'cron-parser'

export function validateCron(expression: string): { valid: true } | { valid: false; error: string } {
  try {
    parseExpression(expression)
    return { valid: true }
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Invalid cron expression' }
  }
}
