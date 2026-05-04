import { describe, it, expect, beforeAll } from 'vitest'
import { encryptChannelConfig, decryptChannelConfig } from './alert-channel-crypto'

beforeAll(() => {
  process.env.ENCRYPTION_KEY = '0'.repeat(64)
})

describe('encryptChannelConfig', () => {
  it('discord — encrypts url', () => {
    const out = encryptChannelConfig('discord', { url: 'https://discord.com/api/webhooks/123/secret' })
    expect(out.url).toMatch(/^enc:v1:/)
  })

  it('zulip — encrypts apiKey only, leaves url/email/stream plaintext', () => {
    const out = encryptChannelConfig('zulip', {
      url:     'https://zulip.example.com',
      email:   'bot@example.com',
      apiKey:  'super-secret',
      stream:  'ops',
      topic:   'alerts',
    })
    expect(out.url).toBe('https://zulip.example.com')
    expect(out.email).toBe('bot@example.com')
    expect(out.stream).toBe('ops')
    expect(out.topic).toBe('alerts')
    expect(out.apiKey).toMatch(/^enc:v1:/)
  })

  it('pushover — encrypts both apiToken and userKey', () => {
    const out = encryptChannelConfig('pushover', { apiToken: 'a', userKey: 'b' })
    expect(out.apiToken).toMatch(/^enc:v1:/)
    expect(out.userKey).toMatch(/^enc:v1:/)
  })

  it('idempotent — does not double-encrypt already-encrypted values', () => {
    const once = encryptChannelConfig('discord', { url: 'https://example.com/secret' })
    const twice = encryptChannelConfig('discord', once)
    expect(twice.url).toBe(once.url)
  })

  it('unknown channel type — passes through unchanged', () => {
    const cfg = { someField: 'value' }
    const out = encryptChannelConfig('not-a-real-type', cfg)
    expect(out).toEqual(cfg)
  })

  it('missing sensitive field — does not error', () => {
    const out = encryptChannelConfig('discord', {})
    expect(out).toEqual({})
  })

  it('non-string value in sensitive field — passes through', () => {
    const out = encryptChannelConfig('discord', { url: 12345 as unknown as string })
    expect(out.url).toBe(12345)
  })
})

describe('decryptChannelConfig', () => {
  it('round-trips encrypt then decrypt', () => {
    const original = {
      url:    'https://zulip.example.com',
      email:  'bot@example.com',
      apiKey: 'super-secret',
      stream: 'ops',
    }
    const encrypted = encryptChannelConfig('zulip', original)
    const decrypted = decryptChannelConfig('zulip', encrypted)
    expect(decrypted).toEqual(original)
  })

  it('plaintext input — passes through (back-compat for un-migrated rows)', () => {
    const out = decryptChannelConfig('discord', { url: 'https://example.com/plaintext' })
    expect(out.url).toBe('https://example.com/plaintext')
  })

  it('unknown channel type — passes through', () => {
    const out = decryptChannelConfig('mystery', { foo: 'bar' })
    expect(out).toEqual({ foo: 'bar' })
  })

  it('corrupt ciphertext — throws (caller catches)', () => {
    expect(() =>
      decryptChannelConfig('discord', { url: 'enc:v1:not-real-base64' }),
    ).toThrow()
  })
})
