import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface AgentConfig {
  serverUrl: string
  token: string
  agentId?: string
}

const CONFIG_DIR  = join(homedir(), '.config', 'backupos-agent')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

export function readConfig(): AgentConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8')
    return JSON.parse(raw) as AgentConfig
  } catch {
    throw new Error('No config found. Run: backupos-agent enroll --url URL --token TOKEN')
  }
}

export function writeConfig(config: AgentConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
}
