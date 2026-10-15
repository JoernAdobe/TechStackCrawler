import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { execSync } from 'child_process'

function getGitCommit(): string {
  if (process.env.VITE_GIT_COMMIT) return process.env.VITE_GIT_COMMIT
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_GIT_COMMIT': JSON.stringify(getGitCommit()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // Backend weg (z. B. tsx-watch-Neustart): JSON statt leerer 500, damit der Client
        // eine verständliche Meldung zeigen kann.
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            if (!('writeHead' in res) || res.headersSent) return
            res.writeHead(502, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
              error: 'Server was restarted or is unreachable – please try again.',
              code: 'server_unreachable',
            }))
          })
        },
      },
    },
  },
})
