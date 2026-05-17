import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

// Strip `platform` from rollup options to prevent Vite crash
const crxFix = {
  name: 'crx-fix',
  enforce: 'post' as const,
  options(options: any) {
    if (options && options.platform) {
      delete options.platform;
    }
    return options;
  }
}

export default defineConfig({
  plugins: [react(), crx({ manifest }), crxFix],
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
    cors: {
      origin: '*',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
