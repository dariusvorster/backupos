import { spawn } from 'child_process'
import type { AppHook, AppHookConfig, PreHookResult } from './types'

export class CustomShellHook implements AppHook {
  readonly appType = 'custom_shell' as const
  readonly displayName = 'Custom Shell Script'

  async pre(config: AppHookConfig): Promise<PreHookResult> {
    if (config.customPreScript) {
      await this.runScript(config.customPreScript)
    }
    return {
      frozenAt: new Date(),
      metadata: { strategy: 'custom_shell' },
    }
  }

  async post(config: AppHookConfig, _preResult: PreHookResult): Promise<void> {
    if (config.customPostScript) {
      await this.runScript(config.customPostScript)
    }
  }

  // Runs a script path — never evaluates inline strings as shell commands
  private runScript(scriptPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(scriptPath, [], { stdio: 'inherit' })
      proc.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`Custom script exited with code ${code}`))
      })
      proc.on('error', reject)
    })
  }
}
