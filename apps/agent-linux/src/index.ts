import { parseArgs } from 'node:util'
import { writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { readConfig, writeConfig } from './config'
import { startAgent } from './ws'

const AGENT_VERSION = '0.1.0'

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

function run(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, { stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with status ${result.status ?? 'unknown'}`)
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
    const unit = `[Unit]
Description=BackupOS Agent
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/backupos-agent run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`
    writeFileSync('/etc/systemd/system/backupos-agent.service', unit)
    run('systemctl', ['daemon-reload'])
    run('systemctl', ['enable', 'backupos-agent'])
    console.log('Service installed. Run: backupos-agent service start')

  } else if (subcommand === 'uninstall') {
    spawnSync('systemctl', ['disable', 'backupos-agent'], { stdio: 'inherit' })
    spawnSync('rm', ['-f', '/etc/systemd/system/backupos-agent.service'], { stdio: 'inherit' })
    run('systemctl', ['daemon-reload'])
    console.log('Service removed.')

  } else if (subcommand === 'start') {
    run('systemctl', ['start', 'backupos-agent'])
    console.log('Service started.')

  } else if (subcommand === 'stop') {
    run('systemctl', ['stop', 'backupos-agent'])
    console.log('Service stopped.')

  } else {
    console.error(`Unknown service subcommand: ${subcommand ?? '(none)'}`)
    process.exit(1)
  }

} else {
  console.error(`Unknown command: ${command}`)
  process.exit(1)
}
