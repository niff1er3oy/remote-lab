# Remote Lab — Design Document

Remote Lab is a web platform that lets students, researchers, and instructors book and remotely operate a real physics lab experiment (Lab 8: Biot–Savart law / magnetic fields) over the internet — live camera feeds, real hardware control, live sensor readings, and an AI teaching assistant, all within a booked time slot.

## Tech stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Custom Node server** (`server.js`) wrapping Next.js — a thin wrapper that loads env and picks the listen host. It used to host a `ws` WebSocket server for room chat; that was removed together with the room-sharing feature, so it runs no WebSocket code of its own any more
- **Firebase Authentication** — user accounts (Google sign-in only)
- **Firestore** — all application data (bookings, sessions, notifications, lab catalog)
- **Tailwind CSS 4** — dark navy × bright green (`#c8ff00`) theme, see `AGENTS.md`
- **Anime.js** — UI micro-animations throughout
- **Three.js** — the 3D view of the lab room's field model (`app/lab/FieldView3D.tsx`); fetched on demand, the first time 3D is chosen
- **KaTeX** — typesets the formulas in the AI assistant's replies; loaded on demand, the first time a reply contains one
- **Jest + React Testing Library** — unit tests in `__tests__/`, run with `npm test` (configured through `next/jest` in `jest.config.mjs`). They cover `lib/`, every route handler in `app/api/` (called directly, against in-memory stand-ins for Firestore, Firebase Auth, the LLM and the rig), the components in `app/components/` and the sign-in page. The landing page, the dashboard page and the lab room (`app/lab/`) are not under test. `next/jest` loads `.env`, so `jest.env.ts` swaps the real credentials for test values and `jest.setup.ts` makes Firestore, Firebase Auth and `fetch` throw unless a test mocks them: no test can reach a real service
- **MediaMTX** (external service) — WebRTC (WHEP) camera streaming, proxied through the Next server
- **Typhoon API** (OpenAI-compatible LLM) — the in-lab AI teaching assistant

## Directory structure

```
app/
├── page.tsx, layout.tsx            — landing page (hero with an interactive plot of the
│                                     solenoid's theoretical B(Z), booking calendar,
│                                     experiment overview, steps), root layout
├── login/page.tsx                  — sign-in page (Google popup via the Firebase client SDK)
├── admin/page.tsx                  — admin page: who is in the lab room, emergency stop, open or
│                                     close a lab, block out time, every booking with cancel
├── dashboard/page.tsx               — session hero (live countdown / next round), booking
│                                     calendar beside the booked rounds, handouts, history
├── lab/
│   ├── page.tsx                    — the lab room itself: camera feeds, instrument
│   │                                 selector, sensor/formula panels, field viz,
│   │                                 AI chat, activity log (~2200 lines, all client
│   │                                 components co-located in one file)
│   ├── FieldViz.tsx                — the lab room's field model: the 2D/3D switch and the
│   │                                 section through the axis (2D, SVG)
│   ├── FieldView3D.tsx             — the same model turned about the axis (3D, Three.js)
│   └── LabSummary.tsx              — shown in place of the lab room when a visit ends (finish
│                                     button or time up): what was done, the values, CSV download
├── components/                     — BookingCalendar, DashboardNav, GlobalNotifications,
│                                     PortraitGuard, useNotifications (poll-based hook),
│                                     FieldDiagram (to-scale field-line drawings of the
│                                     coil and solenoid, used on the landing page),
│                                     SlideIn (panel that slides in when it appears),
│                                     KatexMath / MathSource (a formula in the AI chat,
│                                     typeset by KaTeX or shown as its LaTeX source)
└── api/                            — Next.js Route Handlers, see "API routes" below

lib/
├── firebase-admin.ts               — server-side Firestore + Auth (Admin SDK) singleton
├── firebase-client.ts              — browser-side Firebase Auth singleton
├── auth-client.ts                  — Google sign-in helper used by the login page
├── physics.ts                      — Lab 8 formulas (calcBCoil, calcBSolenoid), shared by
│                                     the lab room and the landing page's field plot
├── webrtc-latency.ts               — reads a camera feed's delay (network + jitter buffer
│                                     + decode) from RTCPeerConnection.getStats(); used by
│                                     the latency readout on the lab room's camera panes
├── lab-activity.ts                 — the record of one visit to the lab room (commands, probe
│                                     moves, readings, questions); feeds the log tab, the
│                                     summary and its CSV. Kept in the page only, never stored
├── admin.ts                        — who is an admin: the emails in the ADMIN_EMAILS variable
├── rig.ts                          — runs the rig's scripts (no shell) and cuts both circuits
├── rig-access.ts                   — whether a user's booking is running now (or just
│                                     ended); the check behind every hardware command
├── field-lines.ts                  — generated: field-line paths for FieldDiagram
├── field-model.ts                  — generated: the exact field lines of the rig's coil and
│                                     solenoid for the lab room's field model, with the
│                                     size of the field along each line
├── field-geometry.ts               — reads field-model.ts into what the two views draw:
│                                     which lines, shading, arrowheads, 3D copies, window
├── motion.ts                       — shared anime.js helpers (reduced-motion check,
│                                     reveal-on-scroll, press feedback) for the landing
│                                     page, dashboard and booking calendar
└── session.ts                      — session cookie mint/verify (wraps Admin SDK)

scripts/
├── field-lines.mjs                 — regenerates lib/field-lines.ts by tracing the exact
│                                     Biot-Savart field of the rig's coil and solenoid;
│                                     rerun it if their dimensions change
└── field-model.mjs                 — regenerates lib/field-model.ts the same way for the
                                      lab room's model (the solenoid as a sheet of current,
                                      in closed form), and refuses to write a file whose
                                      axis field or flux does not check out; rerun it too

server.js                           — custom server: loads env and boots Next.js
```

## API routes (`app/api/`)

| Route | Purpose |
|---|---|
| `auth/session`, `auth/me`, `auth/logout` | Session management |
| `bookings`, `bookings/[id]`, `bookings/availability`, `bookings/active-session`, `bookings/notify-upcoming` | Booking CRUD, the 7-day availability grid, "do I have an active session right now" check, and reminder notifications |
| `dashboard/history`, `dashboard/stats` | Dashboard data |
| `notifications` | Notification feed |
| `hardware` | Runs one of the rig's control scripts on the lab machine (from `RIG_SCRIPT_DIR`, with `RIG_PYTHON`). Only for the user whose booking is running right now (`lib/rig-access.ts`); break scripts stay allowed for 10 minutes after it ends. Body: `{ script }` for `coil_1.py`, `coil_2.py`, `coil_3.py` (switch a coil on), `coil_b.py`, `sole_b.py` (cut a circuit), or `{ script: "sole.py", position }` with a whole number from −10 to 10, run as `sole.py --position <n>`. A position is one of the 21 points the arm takes the probe to, 1 cm apart: position n is n cm from the middle of the 8 cm solenoid (`lib/physics.ts`). `sole_b.py` on the lab machine switches the supply off by running the `relay_off.py` next to it with the venv's Python, then returns the arm. Nothing else is accepted and nothing goes through a shell. The relay on the power supply (`relay_on.py`, `relay_off.py`) is not among these commands: it is switched through `lab/presence` |
| `lab/presence` | The lab page reports `{ action }`: `enter` when the student presses start, `stay` every 20 seconds, `leave` when the visit ends or the page is left (by `sendBeacon` when the tab closes). The power supply follows (`lib/lab-presence.ts`): on when a student with a running round enters, off when the room is empty, after cutting whatever circuit was left on. A page that has been quiet for 90 seconds counts as gone. Two more actions, `on` and `off`, are the student's own switch in the lab room, for as long as their round runs. Answers `{ ok, supply, held }`. A supply an admin switched off is held: it stays off for whoever is in the room, their `on` is refused with 409 and the switch is locked, until an admin switches it on or the next student enters |
| `cam/[...path]` | Reverse proxy for WHEP camera signaling — see "Camera streaming" below |
| `chat` | Proxies to the Typhoon LLM API for the AI teaching assistant. Signed-in users only; accepts user/assistant turns (last 20, 4,000 characters each) plus the current readings, and streams the answer back as SSE |
| `admin/overview`, `admin/bookings/[id]`, `admin/blocks`, `admin/labs/[id]`, `admin/rig/stop` | The admin page's API, for the people named in `ADMIN_EMAILS` only (403 for everyone else). `overview` lists the labs, the round running now and every booking in a range of days, with names from Firebase Auth. `bookings/[id]` cancels a round that has not started or ends the one running now (which also cuts the rig's circuits); its owner gets a notification. `blocks` closes a stretch of time to booking. `labs/[id]` opens or closes a lab to booking. `rig/stop` cuts both circuits and switches the power supply off at once, whoever has the rig. `rig/power` switches the supply on or off, whoever is in the room; switched off, it overrides the student's own switch. `rig/instruments` closes instruments to students or opens them again (`lib/instruments.ts`, `lib/rig-settings.ts`): a closed one is left out of the lab room's list (`bookings/active-session` reports the list) and `hardware` refuses to start it; at least one must stay open. `status` (also listed under `admin/`) reports the equipment: what the rig was last told to do (a record kept in memory by `lib/rig.ts`, not a reading from the rig), and whether each camera and the sensor service answer (`lib/lab-status.ts`) |
| `db-test` | Trivial Firestore connectivity health-check |

## Data model (Firestore)

There is no fixed schema file — Firestore is schemaless — but the app expects these collections:

- **`labs/{labId}`** — the experiment catalog (currently one seeded document, `LAB8`). Fields: `code`, `name_th`, `name_en`, `description_th`, `duration_minutes`, `is_active`. `labId` doubles as the human-readable code (e.g. `"LAB8"`) — no separate UUID.
- **`bookings/{bookingId}`** (auto-ID) — `user_id`, `lab_id`, `start_time`/`end_time` (Timestamps), `status` (`pending`/`confirmed`/`in_progress`/`completed`/`cancelled`), plus `notified_can_enter_at`/`notified_starting_soon_at` (reminder de-dup flags).
- **`sessions/{bookingId}`** — one doc per booking, **keyed by the booking's own ID** (not a separate auto-ID) so "start" is a plain existence-check-then-create instead of an upsert. Fields: `user_id`, `lab_id`, `booking_id`, `start_time`, `end_time`, `duration_seconds`, `status`.
- **`settings/rig`** — one document of rig settings an admin changes at run time: `disabled_instruments` (the scripts of the instruments closed to students, e.g. `["coil_1.py", "coil_2.py", "coil_3.py"]`), `updated_by`, `updated_at`. Absent until an admin first closes something.
- **`notifications/{notificationId}`** (auto-ID) — `user_id`, `title`, `message`, `type`, `action_url`, `is_read`, `created_at`.

Leftovers from the removed room-sharing feature may still exist in the database and are no longer read or written: the `lab_chat` collection, and a `room_code` field on bookings created before the removal.

User profile data (`name`, `role`) is **not** stored in Firestore — it lives on the Firebase Auth user record itself (`displayName` for name, a custom claim for `role`), so reading the current user (`/api/auth/me`) is pure JWT verification with zero database reads.

## Auth & sessions

- **Google is the only sign-in method.** There is no signup flow and no email/password login — a user's Firebase Auth record is created automatically by their first Google sign-in.
- **Login** happens **client-side** via the Firebase Auth SDK (a Google popup). The client then POSTs the resulting ID token to `POST /api/auth/session`, which mints an **httpOnly session cookie** via `adminAuth.createSessionCookie()`.
- `/api/auth/session` rejects (403) any ID token whose `firebase.sign_in_provider` is not `google.com`. The login page offers nothing else, but the project's public web API key would otherwise let a caller obtain an ID token from another provider straight from the Firebase Auth REST API — so the Email/Password provider should also be disabled in the Firebase console.
- First-time sign-ins have no `role` claim yet; `/api/auth/session` defaults it to `'student'` and asks the client to force-refresh its ID token once before retrying, since a session cookie's claims are a snapshot of whatever ID token minted it — not the live user record. Nothing in the app assigns any other role, and no route decides anything by it.
- **Admins are named in configuration, not in data.** `ADMIN_EMAILS` (comma separated, in `.env`) lists the Google accounts that may open `/admin` and call `/api/admin/*`; `lib/admin.ts` compares the session's email with it on every request. Changing the list takes a restart.
- **A blocked stretch of time is a booking.** It is held in the admin's own name with `blocked: true` and an optional `note`, so the calendar and the overlap check need no special case; cancelling it lifts the block. While it runs, the admin who made it has the rig, as with any booking of theirs.
- Server-side routes that need a user verify the `session` cookie through `getSessionUser()` in `lib/session.ts`, i.e. `adminAuth.verifySessionCookie(cookie, /* checkRevoked */ false)` — a local JWT check against Firebase's cached public keys, no network round-trip and no database read.

## Booking overlap prevention

Double-booking the same lab for overlapping time ranges is prevented with a Firestore `runTransaction()` in `POST /api/bookings`: inside the transaction it reads all `bookings` for that `lab_id` with an active status (`pending`/`confirmed`/`in_progress`) whose `start_time` is before the new booking's end, filters for actual overlap in JS, and aborts (409) if any are found — otherwise it writes the new booking. Firestore transactions retry automatically on write conflicts, giving the same race-safety a database-level constraint would.

Firestore has no equivalent of a SQL `CHECK` constraint, so `end_time > start_time` and "not booking in the past" are validated explicitly in the route before the transaction runs.

## Real-time architecture

The app has no WebSocket server of its own. The room-sharing feature (room codes, the `/view/[code]` spectator page, in-room chat and the `/ws` room server in `server.js`) was removed; a lab session now has exactly one participant, the user who booked it.

The only live socket is the sensor feed: the lab page opens `/ws/sensor`, which `next.config.ts` rewrites to the sensor service named in `SENSOR_URL` (`ws://127.0.0.1:8888` unless set). The rewrite is fixed when the app is built, so a new address needs a build as well as a restart. The service sends `{"bx", "by", "bz"}` in microtesla; `lib/sensor.ts` turns each message into the size of the field in mT and applies the calibration fitted on the rig (`CALIBRATION`). What the lab room shows and records is that value with the room's own field taken off: on entering (the start button), before the power supply or any circuit is switched on, the page takes one reading of the background (the mean of 20 values, as every recorded reading is) and from then on subtracts it from every value, calibrated less calibrated (`aboveBackground`). The background is in the visit's record, the summary and both CSV files; if the sensor sends nothing at entry, nothing is subtracted and the page says so beside the measured value. The student can have the zero read again with the **Set 0** button in the readings panel, where the probe now is. It works only while the power supply is off (with current in the winding the sensor reads the very field being measured, and pressing it then only says to switch the supply off first); every zero is in the record with its time, and each measured position of the solenoid keeps the zero that was in force when it was read. Both are sizes, not vectors, so the result is the instrument's own field only as far as the background lies along it. Next.js attaches its own upgrade listener to the HTTP server for that rewrite (and for HMR in development), so `server.js` needs no upgrade handling.

Notifications are polled, not pushed — `useNotifications()` calls `/api/notifications` + `/api/bookings/notify-upcoming` every 30 seconds, plus immediately on a `booking-created` DOM event fired by the booking calendar.

## Camera streaming

Two physical cameras (`cam1`, `cam2`, `cam3` per experiment type — main + secondary depending on whether the selected instrument is a coil or solenoid) run on MediaMTX at a separate machine (`http://34.87.165.238:8889`), configured via env vars of the same names (`cam1=http://.../camera1`, etc.). The browser never talks to MediaMTX directly — it POSTs its WHEP SDP offer to `/api/cam/{camKey}/whep`, a same-origin proxy in `app/api/cam/[...path]/route.ts` that forwards to the right MediaMTX URL server-side. The proxy attaches the camera's credentials, so it only forwards paths that stay under that camera's own URL: a `..` segment, or one carrying a slash (which arrives when a caller encodes it), is answered with 404. This keeps the camera host configurable without rebuilding the client bundle and works regardless of what public domain the Next app itself is served behind.

## Deployment

- `Dockerfile` builds the Next app into a single image (`remote-lab:latest`).
- `docker-compose.yml` runs that image plus a `cloudflared` tunnel container for public ingress — there is no database container; all server-side env vars (Firebase Admin credentials, camera URLs, Typhoon key, admin emails, the rig's script folder, tunnel token) are supplied via `.env` (`env_file: .env`). `.env.example` lists every variable with a note on each.
- Firestore composite indexes are not defined in a `firestore.indexes.json` — they were created ad hoc through the Firebase Console as each query's `FAILED_PRECONDITION` error surfaced during development. If Firestore is ever reset, the composite indexes needed are: `labs(is_active, code)`, `bookings(lab_id, status, start_time)`, `bookings(status, start_time)`, `bookings(user_id, status, start_time)`, `bookings(user_id, start_time desc)`, `notifications(user_id, created_at desc)`.

## Notable non-obvious behavior

- **The lab room's field model is computed, not drawn** — `scripts/field-model.mjs` traces the field lines of the rig's own coil (radius 1.3 cm) and solenoid (8 cm long, radius 2.1 cm) through the exact off-axis field and stores them in `lib/field-model.ts`, with |B| along each line; `__tests__/field-model.test.ts` checks them against a direct Biot-Savart sum over the wire. Both views (`app/lab/FieldViz.tsx`, `FieldView3D.tsx`, through `lib/field-geometry.ts`) draw those lines to scale. What the drawing means: a line's level is the field summed outward along the mid-plane, in equal steps, so across the mid-plane inside the winding the lines crowd where the field is strong (only there: the field is axisymmetric, and further round a line its gaps follow other things too); the coil's n-turn drawing has n times the lines of the one-turn one; a line's brightness rises with |B| and is measured against the strongest field in that drawing, so it compares places within one drawing and says nothing between drawings; in 3D a line is repeated round the axis in proportion to how far from it it starts, so that each line carries about the same share of the field (the solenoid's within 1 %, the coil's within about a sixth either way; the axis line and the last 2.6 mm next to the coil's wire are outside that count), and a line that leaves the traced region fades out at its edge instead of stopping in mid-air. The probe's two arrows are the field at the probe from theory and from the sensor (which reports a size, drawn along the axis for comparison), each against the theory field at the centre and no longer than 1.3 times it. The 3D camera backs off as the model is turned, so the probe's whole travel stays in the picture, and its canvas exists only while its layout is the visible one. Direction: the current runs counterclockwise seen from +z (out of the page at the top of the section), so B points along +z on the axis. The rig's dimensions are written in both `lib/physics.ts` and the two generators: change them together and rerun both.

- **No pagination via offset/limit anywhere** — Firestore doesn't support it efficiently. `dashboard/history` uses a cursor (`start_time` of the last item returned) instead of a page number. Two bookings can share a start time (a slot cancelled and booked again), so a page never ends between them and can hold more than ten.
- **`labId` is a human-readable string, not a UUID** — `labs/LAB8` — chosen deliberately since Firestore doesn't need surrogate keys, and it keeps `lab_id` fields readable in the console.
- **The lab room adapts to viewport height, not only width** — the page never scrolls as a whole, so the desktop tree (≥1024px) has to fit whatever height it gets. The camera row is sized from the 16:9 shape of the feeds; the bottom row (selector, readings, formula, field view, Z table) takes the rest but has a minimum height, so on an 11–12" screen (roughly 1024–1366 × 600–760 once browser chrome is subtracted) the cameras give up height first and the left column scrolls only as a last resort. The `short:` Tailwind variant (`max-height: 760px`, declared in `app/globals.css`) only tightens spacing on top of that. Below 1024px wide the tabbed compact tree is used instead. Both trees stay mounted and are switched with CSS.
