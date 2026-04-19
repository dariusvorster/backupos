import { getDb, operationalLogs } from '@backupos/db'
import { randomUUID }             from 'crypto'

export type LogLevel      = 'debug' | 'info' | 'warn' | 'error' | 'fatal'
export type LogComponent  = 'web' | 'agent' | 'engine' | 'hypervisor' | 'hook' | 'monitor'
export type LogEntityType = 'job' | 'agent' | 'repository' | 'monitor' | 'restore_run'

export interface AppendLogInput {
  level:       LogLevel
  component:   LogComponent
  message:     string
  payload?:    Record<string, unknown>
  entityType?: LogEntityType
  entityId?:   string
}

export function appendLog(input: AppendLogInput): void {
  const db = getDb()
  db.insert(operationalLogs).values({
    id:         randomUUID(),
    level:      input.level,
    component:  input.component,
    message:    input.message,
    payload:    input.payload ? JSON.stringify(input.payload) : null,
    entityType: input.entityType ?? null,
    entityId:   input.entityId   ?? null,
    createdAt:  new Date(),
  }).run()
}
