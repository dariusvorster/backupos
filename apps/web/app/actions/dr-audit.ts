'use server'

interface LogDrActionInput {
  action:    'restore_file' | 'restore_database' | 'restore_host'
  jobId:     string
  target:    string
  dryRun:    boolean
  metadata?: Record<string, string>
}

export async function logDrAction(_input: LogDrActionInput): Promise<void> {
  // full implementation in Task 7
}
