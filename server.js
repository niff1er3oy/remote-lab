// Load .env.local / .env before anything reads process.env
const { loadEnvConfig } = require('@next/env')
loadEnvConfig(process.cwd())

const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

const port = parseInt(process.env.PORT || '3000', 10)
const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const listenHost = process.env.LISTEN_HOST || (dev ? 'localhost' : '0.0.0.0')

const app = next({ dev, hostname, port, turbopack: dev })
const handle = app.getRequestHandler()

// ─── Server bootstrap ─────────────────────────────────────────────────────────
// No WebSocket handling of our own: Next.js attaches its own upgrade listener
// to this server for HMR and for the /ws/sensor rewrite in next.config.ts.
app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      await handle(req, res, parse(req.url, true))
    } catch (err) {
      console.error('Request error:', req.url, err)
      res.statusCode = 500
      res.end('internal server error')
    }
  })

  httpServer
    .once('error', (err) => { console.error(err); process.exit(1) })
    .listen(port, listenHost, () => {
      console.log(`> Ready on http://${listenHost}:${port} [${dev ? 'dev' : 'production'}]`)
    })
})
