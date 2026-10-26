import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The preview is served through Traefik on a per-sandbox host
// (s-<id>-3000.preview.<domain>), so the dev server must listen on all
// interfaces and accept that forwarded Host header.
// Serve the standalone chess page at /chess/ (the dev server's SPA fallback would
// otherwise answer with the main app's index.html).
const chessRoute = {
  name: 'chess-route',
  configureServer(server: any) {
    server.middlewares.use((req: any, _res: any, next: () => void) => {
      if (req.url === '/chess' || req.url === '/chess/' || req.url?.startsWith('/chess?') || req.url?.startsWith('/chess/?')) req.url = '/chess/index.html'
      next()
    })
  },
  configurePreviewServer(server: any) {
    server.middlewares.use((req: any, _res: any, next: () => void) => {
      if (req.url === '/chess' || req.url === '/chess/') req.url = '/chess/index.html'
      next()
    })
  },
}

export default defineConfig({
  plugins: [react(), chessRoute],
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    allowedHosts: true,
  },
})
