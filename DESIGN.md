# Remote Lab — Design Document

Remote Lab is a web platform that lets students, researchers, and instructors book and remotely operate a real physics lab experiment (Lab 8: Biot–Savart law / magnetic fields) over the internet — live camera feeds, real hardware control, live sensor readings, and an AI teaching assistant, all within a booked time slot.

## Tech stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Custom Node server** (`server.js`) wrapping Next.js — needed because the app also runs a raw `ws` WebSocket server on the same port/process for real-time chat, notifications, and lab data
- **Firebase Authentication** — user accounts (email/password + Google)
- **Firestore** — all application data (bookings, sessions, chat, notifications, lab catalog)
- **Tailwind CSS 4** — dark navy × bright green (`#c8ff00`) theme, see `AGENTS.md`
- **Anime.js** — UI micro-animations throughout
- **Three.js** — 3D field visualization (`app/lab/FieldViz.tsx`)
- **MediaMTX** (external service) — WebRTC (WHEP) camera streaming, proxied through the Next server
- **Typhoon API** (Claude-compatible LLM) — the in-lab AI teaching assistant

## Directory structure

```
app/
├── page.tsx, layout.tsx            — landing page, root layout
├── login/, signup/                 — auth pages (client-side Firebase sign-in)
├── dashboard/page.tsx               — booking calendar, stats, history, notifications
├── lab/
│   ├── page.tsx                    — the lab room itself: camera feeds, instrument
│   │                                 selector, sensor/formula panels, field viz,
│   │                                 AI chat, room chat, activity log (~2500 lines,
│   │                                 all client components co-located in one file)
│   └── FieldViz.tsx                — Three.js magnetic field visualization
├── view/[code]/page.tsx            — read-only spectator view via a room code (no login)
├── components/                     — BookingCalendar, DashboardNav, GlobalNotifications,
│                                     PortraitGuard, useNotifications (poll-based hook)
└── api/                            — Next.js Route Handlers, see "API routes" below

lib/
├── firebase-admin.ts               — server-side Firestore + Auth (Admin SDK) singleton
├── firebase-client.ts              — browser-side Firebase Auth singleton
├── auth-client.ts                  — sign-in helpers (email/password, Google) shared by
│                                     login/signup pages
├── session.ts                      — session cookie mint/verify (wraps Admin SDK)
└── validate-room.ts                — shared "is this room code live right now?" lookup,
                                      used by 3 different lab-room routes

server.js                           — custom server: boots Next.js + a `ws` WebSocket
                                      server on the same HTTP server/port
```

## API routes (`app/api/`)

| Route | Purpose |
|---|---|
| `auth/signup`, `auth/session`, `auth/me`, `auth/logout` | Account creation and session management |
| `bookings`, `bookings/[id]`, `bookings/availability`, `bookings/active-session`, `bookings/notify-upcoming` | Booking CRUD, the 7-day availability grid, "do I have an active session right now" check, and reminder notifications |
| `lab/join`, `lab/view`, `lab/chat`, `lab/chat-view` | Room-code based lab access (authenticated + anonymous variants) and lab chat |
| `dashboard/history`, `dashboard/stats` | Dashboard data |
| `notifications` | Notification feed |
| `hardware` | Executes a local Python script to drive the physical coil/solenoid rig (session-gated, no DB access) |
| `cam/[...path]` | Reverse proxy for WHEP camera signaling — see "Camera streaming" below |
| `chat` | Proxies to the Typhoon LLM API for the AI teaching assistant |
| `db-test` | Trivial Firestore connectivity health-check |

## Data model (Firestore)

There is no fixed schema file — Firestore is schemaless — but the app expects these collections:

- **`labs/{labId}`** — the experiment catalog (currently one seeded document, `LAB8`). Fields: `code`, `name_th`, `name_en`, `description_th`, `duration_minutes`, `is_active`. `labId` doubles as the human-readable code (e.g. `"LAB8"`) — no separate UUID.
- **`bookings/{bookingId}`** (auto-ID) — `user_id`, `lab_id`, `start_time`/`end_time` (Timestamps), `status` (`pending`/`confirmed`/`in_progress`/`completed`/`cancelled`), `room_code` (globally unique, generated at creation), plus `notified_can_enter_at`/`notified_starting_soon_at` (reminder de-dup flags).
- **`sessions/{bookingId}`** — one doc per booking, **keyed by the booking's own ID** (not a separate auto-ID) so "start" is a plain existence-check-then-create instead of an upsert. Fields: `user_id`, `lab_id`, `booking_id`, `start_time`, `end_time`, `duration_seconds`, `status`.
- **`lab_chat/{messageId}`** (auto-ID) — live in-room chat. `lab_code`, `user_id`, `user_name`, `content`, `created_at` (server timestamp).
- **`notifications/{notificationId}`** (auto-ID) — `user_id`, `title`, `message`, `type`, `action_url`, `is_read`, `created_at`.

User profile data (`name`, `role`) is **not** stored in Firestore — it lives on the Firebase Auth user record itself (`displayName` for name, a custom claim for `role`), so reading the current user (`/api/auth/me`, the WebSocket auth handshake) is pure JWT verification with zero database reads.

## Auth & sessions

- **Email/password signup** (`POST /api/auth/signup`) is server-side: Admin SDK `createUser()` + `setCustomUserClaims({role})`.
- **Login** (both email/password and Google) happens **client-side** via the Firebase Auth SDK — the server never sees a plaintext password, and Google sign-in is a browser popup. The client then POSTs the resulting ID token to `POST /api/auth/session`, which mints an **httpOnly session cookie** via `adminAuth.createSessionCookie()`.
- First-time Google sign-ins have no `role` claim yet; `/api/auth/session` defaults it to `'student'` and asks the client to force-refresh its ID token once before retrying, since a session cookie's claims are a snapshot of whatever ID token minted it — not the live user record.
- Every server-side route (and the WebSocket upgrade handler in `server.js`) verifies the same `session` cookie via `adminAuth.verifySessionCookie(cookie, /* checkRevoked */ false)` — a local JWT check against Firebase's cached public keys, no network round-trip and no database read. `server.js` duplicates a small piece of this logic (it's a plain `.js` CommonJS file, not part of the Next.js/TS module graph) but authenticates against the exact same session cookie.

## Booking overlap prevention

Double-booking the same lab for overlapping time ranges is prevented with a Firestore `runTransaction()` in `POST /api/bookings`: inside the transaction it reads all `bookings` for that `lab_id` with an active status (`pending`/`confirmed`/`in_progress`) whose `start_time` is before the new booking's end, filters for actual overlap in JS, and aborts (409) if any are found — otherwise it writes the new booking. Firestore transactions retry automatically on write conflicts, giving the same race-safety a database-level constraint would.

Firestore has no equivalent of a SQL `CHECK` constraint, so `end_time > start_time` and "not booking in the past" are validated explicitly in the route before the transaction runs.

## Real-time architecture

`server.js` runs a `ws` WebSocket server (`/ws`) alongside the Next.js request handler, in the same process. On upgrade, it authenticates the request's `session` cookie the same way API routes do, then joins the socket to a room (`?room=<id>`, default `user:<uid>`). Message types: `chat`, `lab_data`, `booking_status`, `notification`, `join_room`, `ping`. API routes can broadcast into a room via `global.__wssBroadcastToRoom`, set up by `server.js` at boot (e.g. `lab/chat` broadcasts a new message to `lab:<roomCode>` right after writing it to Firestore).

Notifications, by contrast, are **not** pushed over the WebSocket to the client UI — `useNotifications()` polls `/api/notifications` + `/api/bookings/notify-upcoming` every 30 seconds, plus immediately on a `booking-created` DOM event fired by the booking calendar. The WS `notification` message type exists in the server's router but nothing in the current client subscribes to it.

## Camera streaming

Two physical cameras (`cam1`, `cam2`, `cam3` per experiment type — main + secondary depending on whether the selected instrument is a coil or solenoid) run on MediaMTX at a separate machine (`http://34.87.165.238:8889`), configured via env vars of the same names (`cam1=http://.../camera1`, etc.). The browser never talks to MediaMTX directly — it POSTs its WHEP SDP offer to `/api/cam/{camKey}/whep`, a same-origin proxy in `app/api/cam/[...path]/route.ts` that forwards to the right MediaMTX URL server-side. This keeps the camera host configurable without rebuilding the client bundle and works regardless of what public domain the Next app itself is served behind.

## Deployment

- `Dockerfile` builds the Next app into a single image (`remote-lab:latest`).
- `docker-compose.yml` runs that image plus a `cloudflared` tunnel container for public ingress — there is no database container; all server-side env vars (Firebase Admin credentials, camera URLs, Typhoon key, tunnel token) are supplied via `.env` (`env_file: .env`).
- Firestore composite indexes are not defined in a `firestore.indexes.json` — they were created ad hoc through the Firebase Console as each query's `FAILED_PRECONDITION` error surfaced during development. If Firestore is ever reset, the composite indexes needed are: `labs(is_active, code)`, `bookings(lab_id, status, start_time)`, `bookings(status, start_time)`, `bookings(user_id, status, start_time)`, `bookings(user_id, start_time desc)`, `lab_chat(lab_code, created_at)`, `notifications(user_id, created_at desc)`.

## Notable non-obvious behavior

- **No pagination via offset/limit anywhere** — Firestore doesn't support it efficiently. `dashboard/history` uses a cursor (`start_time` of the last item returned) instead of a page number; the chat routes (`lab/chat`, `lab/chat-view`) use a `created_at` timestamp `since` cursor instead of an auto-increment row ID.
- **`labId` is a human-readable string, not a UUID** — `labs/LAB8` — chosen deliberately since Firestore doesn't need surrogate keys, and it keeps `lab_id` fields readable in the console.
- **Two components implement the same lab-chat UI independently** — `LabChatPanel` in `app/lab/page.tsx` (authenticated) and `ViewerChatPanel` in `app/view/[code]/page.tsx` (anonymous) — they are not shared, so a fix to one's cursor/pagination logic does not automatically apply to the other.
