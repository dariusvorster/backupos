import { parseExpression } from 'cron-parser'

function translateCronError(rawMessage: string): string {
  if (/Expected\s+\d+(-\d+)?\s+fields/i.test(rawMessage)) {
    return 'Cron expression must have 5 fields: minute hour day-of-month month day-of-week'
  }

  const constraintMatch = rawMessage.match(/Constraint error.*got\s+value\s+(-?\d+).*expected\s+range\s+(-?\d+)-(-?\d+)/i)
  if (constraintMatch) {
    const [, value, min, max] = constraintMatch
    return `Value ${value} is out of range — must be between ${min} and ${max}`
  }

  if (/Invalid range/i.test(rawMessage)) {
    return 'Range is malformed — use the form START-END (e.g. 9-17 for 9am to 5pm)'
  }

  if (/Unexpected character/i.test(rawMessage) || /unknown alias/i.test(rawMessage)) {
    return 'Contains an invalid character — only digits, *, -, /, and , are allowed in each field'
  }

  return 'Invalid cron expression — check the format and try again'
}

export function validateCron(expression: string): { valid: true } | { valid: false; error: string } {
  try {
    parseExpression(expression)
    return { valid: true }
  } catch (err) {
    const raw = err instanceof Error ? err.message : ''
    return { valid: false, error: translateCronError(raw) }
  }
}
