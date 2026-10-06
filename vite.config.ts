import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: {
    // The leva tweak panel is a dev tool: builds get a tiny stub returning defaults.
    alias: command === 'build' ? [{ find: /^leva$/, replacement: '/src/dev/levaStub.ts' }] : [],
  },
}))
