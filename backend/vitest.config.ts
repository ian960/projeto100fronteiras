import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'
import path from 'node:path'

config({ path: '.env.test' })

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false,
  },
})