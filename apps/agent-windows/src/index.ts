import { parseArgs } from 'node:util'
import { spawnSync } from 'node:child_process'
import { readConfig, writeConfig } from './config'
import { startAgent } from './ws'

const AGENT_VERSION = '0.1.0'
const SERVICE_NAME  = 'BackupOSAgent'
const AGENT_EXE     = 'C:\\Program Files\\BackupOS\\backupos-agent.exe'

const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    url:   { type: 'string' },
    token: { type: 'string' },
    help:  { type: 'boolean' },
  },
  allowPositionals: true,
  strict: false,
})

const [command, subcommand] = positionals

if (values.help || !command) {
  console.log(`BackupOS Agent v${AGENT_VERSION}

Usage:
  backupos-agent enroll --url <server-url> --token <token>
  backupos-agent run
  backupos-agent service install
  backupos-agent service uninstall
  backupos-agent service start
  backupos-agent service stop`)
  process.exit(0)
}

function sc(...args: string[]): void {
  const result = spawnSync('sc', args, { stdio: 'inherit' })
  if ((result.status ?? 0) !== 0) {
    throw new Error(`sc ${args.join(' ')} failed with status ${result.status ?? 'unknown'}`)
  }
}

if (command === 'enroll') {
  const url   = values['url']
  const token = values['token']
  if (typeof url !== 'string' || typeof token !== 'string') {
    console.error('--url and --token are required')
    process.exit(1)
  }
  writeConfig({ serverUrl: url, token })
  console.log('Enrolled. Config written.')
  console.log('Next: backupos-agent service install && backupos-agent service start')

} else if (command === 'run') {
  const config = readConfig()
  console.log(`[agent] Connecting to ${config.serverUrl}...`)
  startAgent(config)

} else if (command === 'service') {
  if (subcommand === 'install') {
    sc('create', SERVICE_NAME, `binPath=${AGENT_EXE} run`, 'start=', 'auto')
    sc('description', SERVICE_NAME, 'BackupOS backup agent')
    console.log(`Service '${SERVICE_NAME}' installed. Run: backupos-agent service start`)

  } else if (subcommand === 'uninstall') {
    spawnSync('sc', ['stop', SERVICE_NAME], { stdio: 'inherit' })
    spawnSync('sc', ['delete', SERVICE_NAME], { stdio: 'inherit' })
    console.log(`Service '${SERVICE_NAME}' removed.`)

  } else if (subcommand === 'start') {
    sc('start', SERVICE_NAME)
    console.log('Service started.')

  } else if (subcommand === 'stop') {
    sc('stop', SERVICE_NAME)
    console.log('Service stopped.')

  } else {
    console.error(`Unknown service subcommand: ${subcommand ?? '(none)'}`)
    process.exit(1)
  }

} else {
  console.error(`Unknown command: ${command}`)
  process.exit(1)
}
