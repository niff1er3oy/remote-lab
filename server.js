// Load .env.local / .env before anything reads process.env
const { loadEnvConfig } = require('@next/env')
loadEnvConfig(process.cwd())

const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const { WebSocketServer } = require('ws')
const { initializeApp, getApps, cert } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')

const port = parseInt(process.env.PORT || '3000', 10)
const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const listenHost = process.env.LISTEN_HOST || (dev ? 'localhost' : '0.0.0.0')

const app = next({ dev, hostname, port, turbopack: dev })
const handle = app.getRequestHandler()

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  })
}

// Parse the 'session' cookie and return { userId, role } or null.
// Pure JWT verification against Firebase's cached public keys — no DB call.
async function validateSession(request) {
  try {
    const cookieHeader = request.headers.cookie || ''
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map((c) => {
        const [k, ...v] = c.trim().split('=')
        return [k, decodeURIComponent(v.join('='))]
      })
    )
    const session = cookies['session']
    if (!session) return null

    const decoded = await getAuth().verifySessionCookie(session, false)
    return { userId: decoded.uid, role: decoded.role }
  } catch {
    return null
  }
}

// ─── Room & User Socket registries ───────────────────────────────────────────
// rooms: Map<roomId, Set<WebSocket>>
const rooms = new Map()
// userSockets: Map<userId, Set<WebSocket>>
const userSockets = new Map()

function joinRoom(ws, roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set())
  rooms.get(roomId).add(ws)
  ws.roomId = roomId
}

function leaveRoom(ws) {
  const room = rooms.get(ws.roomId)
  if (room) {
    room.delete(ws)
    if (room.size === 0) rooms.delete(ws.roomId)
  }
}

function broadcastToRoom(roomId, message, exclude = null) {
  const room = rooms.get(roomId)
  if (!room) return
  const data = JSON.stringify(message)
  for (const client of room) {
    if (client !== exclude && client.readyState === 1 /* OPEN */) {
      client.send(data)
    }
  }
}

function sendToUser(userId, message) {
  const sockets = userSockets.get(String(userId))
  if (!sockets) return
  const data = JSON.stringify(message)
  for (const client of sockets) {
    if (client.readyState === 1) client.send(data)
  }
}

// Expose to Next.js API routes (same Node.js process)
global.__wssBroadcastToRoom = broadcastToRoom
global.__wssSendToUser = sendToUser

// ─── Message handler ──────────────────────────────────────────────────────────
function handleMessage(ws, message) {
  const { type, payload } = message
  const now = new Date().toISOString()

  switch (type) {
    // Lab chat — broadcast to everyone in the same room
    case 'chat':
      broadcastToRoom(ws.roomId, {
        type: 'chat',
        userId: ws.userId,
        payload,
        timestamp: now,
      })
      break

    // Lab sensor / equipment data — broadcast to room, exclude sender
    case 'lab_data':
      broadcastToRoom(
        ws.roomId,
        { type: 'lab_data', payload, timestamp: now },
        ws
      )
      break

    // Booking status change — broadcast to room
    case 'booking_status':
      broadcastToRoom(ws.roomId, { type: 'booking_status', payload, timestamp: now })
      break

    // Push a notification to a specific user
    case 'notification':
      if (payload?.targetUserId) {
        sendToUser(payload.targetUserId, {
          type: 'notification',
          payload,
          timestamp: now,
        })
      }
      break

    // Move this connection to a different room
    case 'join_room':
      if (payload?.roomId) {
        leaveRoom(ws)
        joinRoom(ws, payload.roomId)
        ws.send(JSON.stringify({ type: 'room_joined', roomId: ws.roomId }))
      }
      break

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: now }))
      break

    default:
      ws.send(JSON.stringify({ type: 'error', message: `Unknown type: ${type}` }))
  }
}

// ─── Server bootstrap ─────────────────────────────────────────────────────────
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

  const wss = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', async (request, socket, head) => {
    const { pathname } = parse(request.url)
    // Let Next.js handle its own WebSocket paths (HMR, etc.)
    if (pathname !== '/ws') return

    try {
      const auth = await validateSession(request)

      // Socket may have closed while awaiting DB query (StrictMode rapid mount/unmount)
      if (socket.destroyed) return

      if (!auth) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.__auth = auth
        wss.emit('connection', ws, request)
      })
    } catch (err) {
      console.error('[ws upgrade]', err)
      if (!socket.destroyed) socket.destroy()
    }
  })

  wss.on('connection', (ws, request) => {
    const { query } = parse(request.url, true)
    const { userId, role } = ws.__auth

    ws.userId = userId
    ws.role = role
    ws.isAlive = true

    // Default room: per-user inbox, or explicit ?room= param
    const initialRoom = query.room || `user:${userId}`
    joinRoom(ws, initialRoom)

    // Track socket by userId for direct messages
    if (!userSockets.has(userId)) userSockets.set(userId, new Set())
    userSockets.get(userId).add(ws)

    ws.send(JSON.stringify({
      type: 'connected',
      userId,
      roomId: ws.roomId,
      timestamp: new Date().toISOString(),
    }))

    ws.on('pong', () => { ws.isAlive = true })

    ws.on('message', (data) => {
      try {
        handleMessage(ws, JSON.parse(data.toString()))
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }))
      }
    })

    ws.on('close', () => {
      leaveRoom(ws)
      const sockets = userSockets.get(userId)
      if (sockets) {
        sockets.delete(ws)
        if (sockets.size === 0) userSockets.delete(userId)
      }
    })

    ws.on('error', (err) => console.error(`[ws] user=${userId}`, err))
  })

  // Heartbeat — terminate broken connections every 30 s
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        leaveRoom(ws)
        ws.terminate()
        continue
      }
      ws.isAlive = false
      ws.ping()
    }
  }, 30_000)

  wss.on('close', () => clearInterval(heartbeat))

  httpServer
    .once('error', (err) => { console.error(err); process.exit(1) })
    .listen(port, listenHost, () => {
      console.log(`> Ready on http://${listenHost}:${port} [${dev ? 'dev' : 'production'}]`)
      console.log(`> WebSocket on ws://${listenHost}:${port}/ws`)
    })
})
