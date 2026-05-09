import type { NextConfig } from 'next'

const NATIVE_EXTERNALS = ['better-sqlite3', 'bindings', 'file-uri-to-path']

const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'X-XSS-Protection',          value: '1; mode=block' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
  {
    key:   'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
]

const config: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: '/(.*)', headers: SECURITY_HEADERS }]
  },
  serverExternalPackages: ['better-sqlite3', 'bindings', 'file-uri-to-path', '@backupos/docs-content'],
  webpack(webpackConfig, { isServer }) {
    if (isServer) {
      webpackConfig.externals = [
        ...(Array.isArray(webpackConfig.externals) ? webpackConfig.externals : [webpackConfig.externals]),
        (ctx: { request?: string }, cb: (err: null, result?: string) => void) => {
          if (ctx.request && NATIVE_EXTERNALS.includes(ctx.request)) {
            return cb(null, `commonjs ${ctx.request}`)
          }
          cb(null)
        },
      ]
    }
    return webpackConfig
  },
}

export default config
