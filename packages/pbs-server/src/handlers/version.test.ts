import { describe, it, expect } from 'vitest'
import { handleVersion } from './version'

describe('handleVersion', () => {
  it('returns the documented PBS shape', () => {
    const out = handleVersion({ version: '4.0.0', release: '1' })
    expect(out).toEqual({
      data: { version: '4.0.0', release: '1', repoid: 'backupos' },
    })
  })

  it('passes through caller-supplied version/release', () => {
    const out = handleVersion({ version: '9.9.9', release: 'beta' })
    expect(out.data.version).toBe('9.9.9')
    expect(out.data.release).toBe('beta')
  })
})
