import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@backupos/db': path.resolve(__dirname, './src/index.ts'),
    },
  },
})
