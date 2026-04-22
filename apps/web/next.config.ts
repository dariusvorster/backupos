import type { NextConfig } from 'next'

const NATIVE_EXTERNALS = ['better-sqlite3', 'bindings', 'file-uri-to-path']

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@backupos/docs-content'],
  serverExternalPackages: ['better-sqlite3', 'bindings', 'file-uri-to-path'],
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
